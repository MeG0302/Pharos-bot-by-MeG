import fs from "fs";
import path from "path";
import qs from "querystring";
import { ethers as e } from "ethers";
import chalkImport from "chalk";
const chalk = chalkImport.default || chalkImport;
import axios from "axios";
import FakeUserAgent from "fake-useragent";
import chains from './chains/index.js';

const pharos = chains.testnet.pharos;
const etc = chains.utils.etc;
const abi = chains.utils.abi;
const contract = chains.utils.contract;

// Constants
const BASE_API = "https://api.pharosnetwork.xyz";
const REF_CODE = "EgD6ykWY3vBkTVaO";
const RPC_URL = "https://testnet.dplabs-internal.com";
const SOCIAL_TASK_IDS = [201, 202, 203, 204];

// Utility Functions
function getRandomAmount(min, max) {
  const amount = (Math.random() * (max - min) + min).toFixed(4);
  return e.parseEther(amount);
}

function maskAddress(address) {
  return address ? `${address.slice(0, 6)}${'*'.repeat(6)}${address.slice(-6)}` : "Unknown";
}

async function askQuestion(question, logger) {
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(chalk.greenBright(`${question}: `), (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function checkBalanceAndApprove(wallet, tokenAddress, spender, logger) {
  const tokenContract = new e.Contract(tokenAddress, abi.ERC20, wallet);
  const allowance = await tokenContract.allowance(wallet.address, spender);
  
  if (allowance === 0n) {
    logger(`System | Approving token for ${wallet.address}`);
    try {
      const tx = await tokenContract.approve(spender, e.MaxUint256);
      await tx.wait(1);
      await etc.delay(3000);
      logger(`System | Approval successful for ${wallet.address}`);
      return true;
    } catch (error) {
      logger(`System | Approval failed: ${chalk.red(error.message)}`);
      return false;
    }
  }
  return true;
}

// Core Functions
async function performSwapUSDC(logger) {
  const maxRetries = 3;
  const retryDelay = 5000;
  const transactionDelay = 3000;

  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, name: walletName } = walletData;
    if (!privateKey) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing private key`);
      continue;
    }

    try {
      const provider = new e.JsonRpcProvider(RPC_URL, { chainId: 688688, name: "pharos-testnet" });
      const wallet = new e.Wallet(privateKey, provider);
      const address = wallet.address;

      const balance = await provider.getBalance(address);
      const balanceEth = e.formatEther(balance);
      logger(`System | ${walletName} | Wallet balance: ${balanceEth} PHRS`);

      const amount = getRandomAmount(0.0001, 0.0003);
      const amountStr = e.formatEther(amount);

      const gasPrice = await provider.getFeeData();
      const estimatedGasLimit = BigInt(200000);
      const gasCost = gasPrice.gasPrice * estimatedGasLimit;
      const totalCost = amount + gasCost * BigInt(global.maxTransaction);

      if (balance < totalCost) {
        logger(`System | Warning: ${walletName} | Insufficient balance for ${global.maxTransaction} swaps`);
        continue;
      }

      const tokenPair = contract.WPHRS.slice(2).padStart(64, "0") + contract.USDC.slice(2).padStart(64, "0");
      const amountHex = amount.toString(16).padStart(64, "0");
      const callData =
        "0x04e45aaf" +
        tokenPair +
        "0000000000000000000000000000000000000000000000000000000000000bb8" +
        address.toLowerCase().slice(2).padStart(64, "0") +
        amountHex +
        "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

      const deadline = Math.floor(Date.now() / 1e3) + 600;
      const swapContract = new e.Contract(
        contract.SWAP,
        ["function multicall(uint256 deadline, bytes[] calldata data) payable"],
        wallet
      );
      const encodedData = swapContract.interface.encodeFunctionData("multicall", [deadline, [callData]]);

      for (let i = 1; i <= global.maxTransaction; i++) {
        logger(`System | ${walletName} | Swap ${amountStr} PHRS to USDC (${i}/${global.maxTransaction})`);

        let success = false;
        for (let attempt = 0; attempt < maxRetries && !success; attempt++) {
          try {
            const txRequest = {
              to: swapContract.target,
              data: encodedData,
              value: amount,
            };

            let gasLimit;
            try {
              gasLimit = (await provider.estimateGas(txRequest)) * 12n / 10n;
            } catch (error) {
              if (attempt < maxRetries - 1) {
                logger(`System | ${walletName} | Gas estimation failed, retrying...`);
                await etc.delay(retryDelay);
                continue;
              }
              throw error;
            }

            txRequest.gasLimit = gasLimit;
            const tx = await wallet.sendTransaction(txRequest);
            await tx.wait(1);
            logger(`System | ${walletName} | ${etc.timelog()} | Swap Confirmed: ${chalk.green(pharos.explorer.tx(tx.hash))}`);
            success = true;
          } catch (error) {
            if (attempt < maxRetries - 1) {
              logger(`System | ${walletName} | Swap attempt failed, retrying...`);
              await etc.delay(retryDelay);
            } else {
              logger(`System | ${walletName} | Swap failed after ${maxRetries} attempts`);
              break;
            }
          }
        }

        if (!success) break;
        await etc.delay(transactionDelay);
      }
    } catch (error) {
      logger(`System | ${walletName} | Error: ${chalk.red(error.message)}`);
    }
  }
}

async function performSwapUSDT(logger) {
  const maxRetries = 3;
  const retryDelay = 5000;
  const transactionDelay = 3000;

  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, name: walletName } = walletData;
    if (!privateKey) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing private key`);
      continue;
    }

    try {
      const provider = new e.JsonRpcProvider(RPC_URL, { chainId: 688688, name: "pharos-testnet" });
      const wallet = new e.Wallet(privateKey, provider);
      const address = wallet.address;

      const balance = await provider.getBalance(address);
      const balanceEth = e.formatEther(balance);
      logger(`System | ${walletName} | Wallet balance: ${balanceEth} PHRS`);

      const amount = getRandomAmount(0.0001, 0.0003);
      const amountStr = e.formatEther(amount);

      const gasPrice = await provider.getFeeData();
      const estimatedGasLimit = BigInt(200000);
      const gasCost = gasPrice.gasPrice * estimatedGasLimit;
      const totalCost = amount + gasCost * BigInt(global.maxTransaction);

      if (balance < totalCost) {
        logger(`System | Warning: ${walletName} | Insufficient balance for ${global.maxTransaction} swaps`);
        continue;
      }

      const tokenPair = contract.WPHRS.slice(2).padStart(64, "0") + contract.USDT.slice(2).padStart(64, "0");
      const amountHex = amount.toString(16).padStart(64, "0");
      const callData =
        "0x04e45aaf" +
        tokenPair +
        "0000000000000000000000000000000000000000000000000000000000000bb8" +
        address.toLowerCase().slice(2).padStart(64, "0") +
        amountHex +
        "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

      const deadline = Math.floor(Date.now() / 1e3) + 600;
      const swapContract = new e.Contract(
        contract.SWAP,
        ["function multicall(uint256 deadline, bytes[] calldata data) payable"],
        wallet
      );
      const encodedData = swapContract.interface.encodeFunctionData("multicall", [deadline, [callData]]);

      for (let i = 1; i <= global.maxTransaction; i++) {
        logger(`System | ${walletName} | Swap ${amountStr} PHRS to USDT (${i}/${global.maxTransaction})`);

        let success = false;
        for (let attempt = 0; attempt < maxRetries && !success; attempt++) {
          try {
            const txRequest = {
              to: swapContract.target,
              data: encodedData,
              value: amount,
            };

            let gasLimit;
            try {
              gasLimit = (await provider.estimateGas(txRequest)) * 12n / 10n;
            } catch (error) {
              if (attempt < maxRetries - 1) {
                logger(`System | ${walletName} | Gas estimation failed, retrying...`);
                await etc.delay(retryDelay);
                continue;
              }
              throw error;
            }

            txRequest.gasLimit = gasLimit;
            const tx = await wallet.sendTransaction(txRequest);
            await tx.wait(1);
            logger(`System | ${walletName} | ${etc.timelog()} | Swap Confirmed: ${chalk.green(pharos.explorer.tx(tx.hash))}`);
            success = true;
          } catch (error) {
            if (attempt < maxRetries - 1) {
              logger(`System | ${walletName} | Swap attempt failed, retrying...`);
              await etc.delay(retryDelay);
            } else {
              logger(`System | ${walletName} | Swap failed after ${maxRetries} attempts`);
              break;
            }
          }
        }

        if (!success) break;
        await etc.delay(transactionDelay);
      }
    } catch (error) {
      logger(`System | ${walletName} | Error: ${chalk.red(error.message)}`);
    }
  }
}

async function addLpUSDC(logger) {
  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, name: walletName } = walletData;
    if (!privateKey) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing private key`);
      continue;
    }
    try {
      const wallet = new e.Wallet(privateKey, pharos.provider());
      const router = new e.Contract(contract.ROUTER, abi.ROUTER, wallet);
      const deadline = Math.floor(Date.now() / 1e3) + 1800;
      
      const approved = await checkBalanceAndApprove(wallet, contract.USDC, contract.ROUTER, logger);
      if (!approved) continue;

      const amount = getRandomAmount(0.2, 0.5);
      const amountStr = e.formatEther(amount);
      
      const params = {
        token0: contract.WPHRS,
        token1: contract.USDC,
        fee: 500,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: amount.toString(),
        amount1Desired: amount.toString(),
        amount0Min: "0",
        amount1Min: "0",
        recipient: wallet.address,
        deadline: deadline,
      };

      const mintData = router.interface.encodeFunctionData("mint", [params]);
      const refundData = router.interface.encodeFunctionData("refundETH", []);
      const multicallData = [mintData, refundData];

      for (let i = 1; i <= global.maxTransaction; i++) {
        logger(`System | ${walletName} | Adding Liquidity ${amountStr} PHRS + ${amountStr} USDC (${i}/${global.maxTransaction})`);
        
        const tx = await router.multicall(multicallData, {
          value: amount,
          gasLimit: 500000,
        });
        
        await tx.wait(1);
        logger(`System | ${walletName} | ${etc.timelog()} | Liquidity Added: ${chalk.green(pharos.explorer.tx(tx.hash))}`);
        await etc.delay(5000);
      }
    } catch (error) {
      logger(`System | ${walletName} | ${etc.timelog()} | Error: ${chalk.red(error.message)}`);
    }
  }
}

async function addLpUSDT(logger) {
  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, name: walletName } = walletData;
    if (!privateKey) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing private key`);
      continue;
    }
    try {
      const wallet = new e.Wallet(privateKey, pharos.provider());
      const router = new e.Contract(contract.ROUTER, abi.ROUTER, wallet);
      const deadline = Math.floor(Date.now() / 1e3) + 1800;
      
      const approved = await checkBalanceAndApprove(wallet, contract.USDT, contract.ROUTER, logger);
      if (!approved) continue;

      const amount = getRandomAmount(0.2, 0.5);
      const amountStr = e.formatEther(amount);
      
      const params = {
        token0: contract.WPHRS,
        token1: contract.USDT,
        fee: 500,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: amount.toString(),
        amount1Desired: amount.toString(),
        amount0Min: "0",
        amount1Min: "0",
        recipient: wallet.address,
        deadline: deadline,
      };

      const mintData = router.interface.encodeFunctionData("mint", [params]);
      const refundData = router.interface.encodeFunctionData("refundETH", []);
      const multicallData = [mintData, refundData];

      for (let i = 1; i <= global.maxTransaction; i++) {
        logger(`System | ${walletName} | Adding Liquidity ${amountStr} PHRS + ${amountStr} USDT (${i}/${global.maxTransaction})`);
        
        const tx = await router.multicall(multicallData, {
          value: amount,
          gasLimit: 500000,
        });
        
        await tx.wait(1);
        logger(`System | ${walletName} | ${etc.timelog()} | Liquidity Added: ${chalk.green(pharos.explorer.tx(tx.hash))}`);
        await etc.delay(5000);
      }
    } catch (error) {
      logger(`System | ${walletName} | ${etc.timelog()} | Error: ${chalk.red(error.message)}`);
    }
  }
}

async function randomTransfer(logger) {
  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, name: walletName } = walletData;
    if (!privateKey) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing private key`);
      continue;
    }
    try {
      const wallet = new e.Wallet(privateKey, pharos.provider());
      const provider = pharos.provider();
      const amount = e.parseEther("0.000001");
      const balance = await provider.getBalance(wallet.address);
      
      if (balance < amount * BigInt(global.maxTransaction)) {
        logger(`System | Warning: ${walletName} | Insufficient balance (${e.formatEther(balance)}) for ${global.maxTransaction} transfers`);
        continue;
      }

      for (let i = 1; i <= global.maxTransaction; i++) {
        const randomWallet = e.Wallet.createRandom();
        const toAddress = randomWallet.address;
        logger(`System | ${walletName} | Transferring 0.000001 PHRS to ${maskAddress(toAddress)} (${i}/${global.maxTransaction})`);
        
        const tx = await wallet.sendTransaction({
          to: toAddress,
          value: amount,
          gasLimit: 21000,
          gasPrice: 0,
        });
        
        await tx.wait(1);
        logger(`System | ${walletName} | ${etc.timelog()} | Transfer Confirmed: ${chalk.green(pharos.explorer.tx(tx.hash))}`);
        await etc.delay(5000);
      }
    } catch (error) {
      logger(`System | ${walletName} | ${etc.timelog()} | Transfer Error: ${chalk.red(error.message)}`);
    }
  }
}

async function accountCheck(logger) {
  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, token: authToken, name: walletName } = walletData;
    if (!privateKey || !authToken) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing data`);
      continue;
    }
    try {
      const wallet = new e.Wallet(privateKey, pharos.provider());
      logger(`System | ${walletName} | Checking Profile Stats for ${wallet.address}`);
      
      const response = await axios.get(`${BASE_API}/user/profile?address=${wallet.address}`, {
        headers: { 
          ...etc.headers,
          authorization: `Bearer ${authToken}` 
        }
      });
      
      const data = response.data;
      if (data.code !== 0 || !data.data?.user_info) {
        logger(`System | ${walletName} | Profile check failed: ${chalk.red(data.msg || "Unknown error")}`);
        continue;
      }
      
      const { ID, TotalPoints, TaskPoints, InvitePoints } = data.data.user_info;
      logger(
        `System | ${walletName} | ${etc.timelog()} | ID: ${ID}, TotalPoints: ${TotalPoints}, TaskPoints: ${TaskPoints}, InvitePoints: ${InvitePoints}`
      );
      
      await etc.delay(5000);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger(
          `System | ${walletName} | HTTP Error: ${chalk.red(
            `${error.response?.status} - ${error.response?.data?.message || error.message}`
          )}`
        );
      } else {
        logger(`System | ${walletName} | Error: ${chalk.red(error.message)}`);
      }
    }
    await etc.delay(5000);
  }
}

async function accountLogin(logger) {
  for (let walletData of global.selectedWallets || []) {
    let { privatekey: privateKey, token: authToken, name: walletName } = walletData;
    if (!privateKey) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing private key`);
      continue;
    }
    
    if (!authToken) {
      logger(`System | ${walletName} | No token found. Attempting login`);
      await etc.delay(3000);
      
      try {
        const wallet = new e.Wallet(privateKey, pharos.provider());
        const signature = await wallet.signMessage("pharos");
        logger(`System | ${walletName} | Logging in to Pharos for ${wallet.address}`);
        
        const response = await axios.post(
          `${BASE_API}/user/login?address=${wallet.address}&signature=${signature}&invite_code=rmKeUmr3VL7bLeva`,
          null,
          { headers: etc.headers }
        );
        
        const data = response.data;
        if (data.code !== 0 || !data.data?.jwt) {
          logger(`System | ${walletName} | Login failed: ${chalk.red(data.msg || "Unknown error")}`);
          continue;
        }
        
        walletData.token = data.data.jwt;
        logger(`System | ${walletName} | Login successful`);
      } catch (error) {
        logger(`System | ${walletName} | ${etc.timelog()} | Login error: ${chalk.red(error.message)}`);
      }
    }
  }

  // Update wallet.json with new tokens
  const walletFile = path.join(process.cwd(), "wallet.json");
  try {
    const walletData = JSON.parse(fs.readFileSync(walletFile, "utf8"));
    const wallets = walletData.wallets || [];
    
    for (const selectedWallet of global.selectedWallets) {
      if (!selectedWallet.privatekey && !selectedWallet.name) continue;
      
      const index = wallets.findIndex(w => 
        w.privatekey.trim().toLowerCase() === selectedWallet.privatekey.trim().toLowerCase()
      );
      
      if (index !== -1) {
        wallets[index].token = selectedWallet.token || "";
      }
    }
    
    fs.writeFileSync(walletFile, JSON.stringify({ wallets }, null, 2), "utf8");
    logger(`System | Updated wallet.json with new tokens`);
  } catch (error) {
    logger(`System | Failed to update wallet.json: ${chalk.red(error.message)}`);
  }
  
  await etc.delay(5000);
}

async function accountCheckIn(logger) {
  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, token: authToken, name: walletName } = walletData;
    if (!privateKey || !authToken) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing data`);
      continue;
    }
    try {
      const wallet = new e.Wallet(privateKey, pharos.provider());
      logger(`System | ${walletName} | Checking in for ${wallet.address}`);
      
      const response = await axios.post(`${BASE_API}/sign/in?address=${wallet.address}`, null, {
        headers: {
          ...etc.headers,
          authorization: `Bearer ${authToken}`,
        }
      });
      
      const data = response.data;
      if (data.code === 0) {
        logger(`System | ${walletName} | ${etc.timelog()} | Check-in successful: ${data.msg}`);
      } else if (data.msg?.toLowerCase().includes("already")) {
        logger(`System | ${walletName} | ${etc.timelog()} | Already checked in`);
      } else {
        logger(`System | ${walletName} | ${etc.timelog()} | Check-in failed: ${chalk.red(data.msg || "Unknown error")}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger(
          `System | ${walletName} | HTTP Error: ${chalk.red(
            `${error.response?.status} - ${error.response?.data?.message || error.message}`
          )}`
        );
      } else {
        logger(`System | ${walletName} | Error: ${chalk.red(error.message)}`);
      }
    }
    await etc.delay(5000);
  }
}

async function claimFaucetUSDC(logger) {
  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, name: walletName } = walletData;
    if (!privateKey) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing private key`);
      continue;
    }
    
    const wallet = new e.Wallet(privateKey, pharos.provider());
    try {
      logger(`System | ${walletName} | Claiming USDC for ${wallet.address}`);
      
      const response = await axios.post(
        "https://testnet-router.zenithswap.xyz/api/v1/faucet",
        {
          tokenAddress: "0xAD902CF99C2dE2f1Ba5ec4D642Fd7E49cae9EE37",
          userAddress: wallet.address,
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...etc.headers,
          },
        }
      );
      
      const data = response.data;
      if (data.status === 200 && data.data?.txHash) {
        logger(`System | ${walletName} | ${etc.timelog()} | USDC Claimed | TxHash: ${chalk.green(pharos.explorer.tx(data.data.txHash))}`);
      } else {
        logger(`System | ${walletName} | ${etc.timelog()} | USDC Claim failed: ${chalk.red(data.message || "Unknown error")}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        logger(`System | ${walletName} | ${etc.timelog()} | USDC Claim Error: ${chalk.red(message)}`);
      } else {
        logger(`System | ${walletName} | ${etc.timelog()} | USDC Claim Unexpected error: ${chalk.red(error.message)}`);
      }
    }
    await etc.delay(5000);
  }
}

async function socialTask(logger) {
  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, token: authToken, name: walletName } = walletData;
    if (!privateKey || !authToken) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing data`);
      continue;
    }

    const wallet = new e.Wallet(privateKey, pharos.provider());
    
    for (let taskId of SOCIAL_TASK_IDS) {
      try {
        logger(`System | ${walletName} | Verifying task ${taskId}`);
        
        const response = await axios.post(
          `${BASE_API}/task/verify`,
          qs.stringify({ address: wallet.address, task_id: taskId }),
          {
            headers: {
              ...etc.headers,
              authorization: `Bearer ${authToken}`,
              "Content-Type": "application/x-www-form-urlencoded",
            }
          }
        );

        if (response.data.code === 0 && response.data.data?.verified) {
          logger(`System | ${walletName} | Task ${taskId} verified`);
        } else {
          logger(`System | ${walletName} | Task verification failed`);
        }
      } catch (error) {
        logger(`System | ${walletName} | Task error: ${error.message}`);
      }
      await etc.countdown(15000, "Countdown");
    }
  }
}

async function accountClaimFaucet(logger) {
  for (let walletData of global.selectedWallets || []) {
    const { privatekey: privateKey, token: authToken, name: walletName } = walletData;
    if (!privateKey || !authToken) {
      logger(`System | Warning: Skipping ${walletName || "wallet"} due to missing data`);
      continue;
    }

    try {
      const wallet = new e.Wallet(privateKey, pharos.provider());
      logger(`System | ${walletName} | Checking faucet status`);

      const statusResponse = await axios.get(`${BASE_API}/faucet/status?address=${wallet.address}`, {
        headers: { ...etc.headers, authorization: `Bearer ${authToken}` }
      });

      if (statusResponse.data.code !== 0 || !statusResponse.data.data) {
        logger(`System | ${walletName} | Status check failed`);
        continue;
      }

      if (!statusResponse.data.data.is_able_to_faucet) {
        const nextAvailable = new Date(statusResponse.data.data.avaliable_timestamp * 1000)
          .toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        logger(`System | ${walletName} | Faucet available at: ${nextAvailable}`);
        continue;
      }

      logger(`System | ${walletName} | Claiming faucet`);
      const claimResponse = await axios.post(
        `${BASE_API}/faucet/daily?address=${wallet.address}`,
        null,
        { headers: { ...etc.headers, authorization: `Bearer ${authToken}` } }
      );

      if (claimResponse.data.code === 0) {
        logger(`System | ${walletName} | Faucet claimed`);
      } else {
        logger(`System | ${walletName} | Claim failed`);
      }
    } catch (error) {
      logger(`System | ${walletName} | Error: ${error.message}`);
    }
    await etc.delay(5000);
  }
}

async function unlimitedFaucet(logger) {
  const provider = new e.JsonRpcProvider(RPC_URL, { chainId: 688688, name: "pharos-testnet" });
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    Origin: "https://testnet.pharosnetwork.xyz",
    Referer: "https://testnet.pharosnetwork.xyz/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "User-Agent": new FakeUserAgent().random,
  };

  // Wallet Generation
  const numWallets = parseInt(await askQuestion("How many wallets to create? (0 to skip)", logger));
  if (numWallets > 0) {
    const wallets = [];
    for (let i = 0; i < numWallets; i++) {
      const wallet = e.Wallet.createRandom();
      wallets.push(wallet.privateKey);
      logger(`System | Generated wallet ${i + 1}/${numWallets}`);
    }
    fs.appendFileSync("address.txt", wallets.join("\n") + "\n");
    logger(`System | Saved ${numWallets} wallets`);
    await etc.delay(3000);
  }

  // Faucet Claiming
  if (!fs.existsSync("address.txt")) {
    logger(`System | No wallets found`);
    return;
  }

  const privateKeys = fs.readFileSync("address.txt", "utf8").split("\n").filter(Boolean);
  let successfulClaims = 0;

  for (const [index, privateKey] of privateKeys.entries()) {
    const walletName = `Wallet${index + 1}`;
    try {
      const wallet = new e.Wallet(privateKey, provider);
      logger(`System | ${walletName} | Processing`);

      // Login
      const signature = await wallet.signMessage("pharos");
      const loginResponse = await axios.post(
        `${BASE_API}/user/login?address=${wallet.address}&signature=${signature}&invite_code=${REF_CODE}`,
        null,
        { headers: { ...headers, Authorization: "Bearer null", "Content-Length": "0" } }
      );
      const token = loginResponse.data.data.jwt;

      // Claim Faucet
      const statusResponse = await axios.get(`${BASE_API}/faucet/status?address=${wallet.address}`, {
        headers: { ...headers, Authorization: `Bearer ${token}` }
      });

      if (statusResponse.data.data?.is_able_to_faucet) {
        const claimResponse = await axios.post(
          `${BASE_API}/faucet/daily?address=${wallet.address}`,
          null,
          { headers: { ...headers, Authorization: `Bearer ${token}`, "Content-Length": "0" } }
        );
        successfulClaims++;
        logger(`System | ${walletName} | Claim successful`);
      } else {
        logger(`System | ${walletName} | Faucet not available`);
      }
    } catch (error) {
      logger(`System | ${walletName} | Error: ${error.message}`);
    }
    await etc.delay(3000);
  }

  logger(`System | Claims completed: ${successfulClaims}/${privateKeys.length}`);

  // Funds Transfer
  if (fs.existsSync("wallet.txt")) {
    const destAddress = fs.readFileSync("wallet.txt", "utf8").trim();
    if (e.isAddress(destAddress)) {
      let successfulTransfers = 0;
      
      for (const [index, privateKey] of privateKeys.entries()) {
        const walletName = `Wallet${index + 1}`;
        try {
          const wallet = new e.Wallet(privateKey, provider);
          const balance = await provider.getBalance(wallet.address);
          
          if (balance > 0) {
            const gasPrice = await provider.getFeeData();
            const gasCost = gasPrice.gasPrice * 21000n;
            const amountToSend = balance - gasCost;
            
            if (amountToSend > 0) {
              const tx = await wallet.sendTransaction({
                to: destAddress,
                value: amountToSend,
                gasLimit: 21000,
              });
              await tx.wait();
              successfulTransfers++;
              logger(`System | ${walletName} | Transfer completed`);
            }
          }
        } catch (error) {
          logger(`System | ${walletName} | Transfer error`);
        }
        await etc.delay(3000);
      }
      
      logger(`System | Transfers completed: ${successfulTransfers}/${privateKeys.length}`);
    }
  }
}

// Export all functions
export {
  getRandomAmount,
  maskAddress,
  askQuestion,
  performSwapUSDC,
  performSwapUSDT,
  addLpUSDC,
  addLpUSDT,
  accountCheckIn,
  accountLogin,
  accountCheck,
  accountClaimFaucet,
  claimFaucetUSDC,
  randomTransfer,
  socialTask,
  unlimitedFaucet
};
