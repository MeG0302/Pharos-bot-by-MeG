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
  // Similar implementation to performSwapUSDC but for USDT
  // ... [Previous implementation unchanged] ...
}

async function addLiquidityUSDCUSDT(logger) {
  // ... [Previous implementation unchanged] ...
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
  addLiquidityUSDCUSDT,
  socialTask,
  accountClaimFaucet,
  unlimitedFaucet
};
