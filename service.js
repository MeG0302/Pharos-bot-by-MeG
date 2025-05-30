import fs from "fs";
import path from "path";
import qs from "querystring";
import { ethers as e } from "ethers";
import chalkImport from "chalk";
const chalk = chalkImport.default || chalkImport;
import axios from "axios";
import FakeUserAgent from "fake-useragent";
import chains from "./chains";

const pharos = chains.testnet.pharos;
const etc = chains.utils.etc;
const abi = chains.utils.abi;
const contract = chains.utils.contract;

// Constants for Unlimited Faucet
const BASE_API = "https://api.pharosnetwork.xyz";
const REF_CODE = "PNFXEcz1CWezuu3g";
const RPC_URL = "https://testnet.dplabs-internal.com";

// Utility to generate random amount in range (inclusive, in PHRS)
function getRandomAmount(min, max) {
  const amount = (Math.random() * (max - min) + min).toFixed(4); // 4 decimal places
  return e.parseEther(amount);
}

// Utility to mask address
function maskAddress(address) {
  return address ? `${address.slice(0, 6)}${'*'.repeat(6)}${address.slice(-6)}` : "Unknown";
}

// Utility to ask for input (used for wallet generation)
async function askQuestion(question, logger) {
  // readline cannot be imported using ESM static import in node without experimental flags,
  // so we do dynamic import here
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

async function performSwapUSDC(logger) {
  const maxRetries = 3; // Number of retry attempts for provider operations
  const retryDelay = 5000; // Delay between retries (5 seconds)
  const transactionDelay = 3000; // Reduced delay between transactions (3 seconds)

  for (let a of global.selectedWallets || []) {
    let { privatekey: t, name: $ } = a;
    if (!t) {
      logger(`System | Warning: Skipping ${$ || "wallet with missing data"} due to missing private key`);
      continue;
    }
    try {
      // Initialize wallet and provider
      let provider = new e.JsonRpcProvider(RPC_URL, { chainId: 688688, name: "pharos-testnet" });
      let r = new e.Wallet(t, provider);
      let o = r.address;

      // Check wallet balance
      let balance = await provider.getBalance(o);
      let balanceEth = e.formatEther(balance);
      logger(`System | ${$} | Wallet balance: ${balanceEth} PHRS`);

      let i = getRandomAmount(0.0001, 0.0003); // Random amount between 0.0001 and 0.0003 PHRS
      let amountStr = e.formatEther(i);

      // Estimate gas cost for a single transaction
      let gasPrice = await provider.getFeeData();
      let estimatedGasLimit = BigInt(200000); // Conservative estimate for swap
      let gasCost = gasPrice.gasPrice * estimatedGasLimit;
      let totalCost = i + gasCost * BigInt(global.maxTransaction);

      if (balance < totalCost) {
        logger(`System | Warning: ${$} | Insufficient balance (${balanceEth} PHRS) for ${global.maxTransaction} swaps of ${amountStr} PHRS plus gas`);
        continue;
      }

      let s = contract.WPHRS.slice(2).padStart(64, "0") + contract.USDC.slice(2).padStart(64, "0");
      let n = i.toString(16).padStart(64, "0");
      let l =
        "0x04e45aaf" +
        s +
        "0000000000000000000000000000000000000000000000000000000000000bb8" +
        o.toLowerCase().slice(2).padStart(64, "0") +
        n +
        "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
      let c = Math.floor(Date.now() / 1e3) + 600;
      let d = ["function multicall(uint256 deadline, bytes[] calldata data) payable"];
      let p = new e.Contract(contract.SWAP, d, r);
      let f = p.interface.encodeFunctionData("multicall", [c, [l]]);

      for (let w = 1; w <= global.maxTransaction; w++) {
        logger(`System | ${$} | Initiating Swap ${amountStr} PHRS to USDC (${w}/${global.maxTransaction})`);

        let success = false;
        let attempt = 0;

        while (!success && attempt < maxRetries) {
          try {
            attempt++;
            let g = {
              to: p.target,
              data: f,
              value: i,
            };

            // Estimate gas with retry
            let gasLimit;
            try {
              gasLimit = (await provider.estimateGas(g)) * 12n / 10n; // 20% buffer
            } catch (gasError) {
              if (attempt < maxRetries) {
                logger(`System | ${$} | Gas estimation failed (attempt ${attempt}/${maxRetries}): ${chalk.yellow(gasError.message)}. Retrying in ${retryDelay / 1000} seconds...`);
                await etc.delay(retryDelay);
                continue;
              } else {
                throw new Error(`Gas estimation failed after ${maxRetries} attempts: ${gasError.message}`);
              }
            }

            g.gasLimit = gasLimit;

            // Send transaction
            let m = await r.sendTransaction(g);
            let receipt = await m.wait(1);
            logger(`System | ${$} | ${etc.timelog()} | Swap Confirmed: ${chalk.green(pharos.explorer.tx(m.hash))}`);
            success = true;
          } catch (u) {
            if (attempt < maxRetries) {
              logger(`System | ${$} | Swap attempt ${attempt}/${maxRetries} failed: ${chalk.yellow(u.message)}. Retrying in ${retryDelay / 1000} seconds...`);
              await etc.delay(retryDelay);
              continue;
            } else {
              logger(`System | ${$} | ${etc.timelog()} | Swap failed after ${maxRetries} attempts: ${chalk.red(u.message)}`);
              break;
            }
          }
        }

        if (!success) {
          logger(`System | ${$} | Skipping remaining swaps due to repeated failures`);
          break;
        }

        await etc.delay(transactionDelay); // Reduced delay for faster transactions
      }
    } catch (u) {
      logger(`System | ${$} | ${etc.timelog()} | Error: ${chalk.red(u.message)}`);
    }
  }
}

async function performSwapUSDT(logger) {
  const maxRetries = 3; // Number of retry attempts for provider operations
  const retryDelay = 5000; // Delay between retries (5 seconds)
  const transactionDelay = 3000; // Reduced delay between transactions (3 seconds)

  for (let a of global.selectedWallets || []) {
    let { privatekey: t, name: $ } = a;
    if (!t) {
      logger(`System | Warning: Skipping ${$ || "wallet with missing data"} due to missing private key`);
      continue;
    }
    try {
      // Initialize wallet and provider
      let provider = new e.JsonRpcProvider(RPC_URL, { chainId: 688688, name: "pharos-testnet" });
      let r = new e.Wallet(t, provider);
      let o = r.address;

      // Check wallet balance
      let balance = await provider.getBalance(o);
      let balanceEth = e.formatEther(balance);
      logger(`System | ${$} | Wallet balance: ${balanceEth} PHRS`);

      let i = getRandomAmount(0.0001, 0.0003); // Random amount between 0.0001 and 0.0003 PHRS
      let amountStr = e.formatEther(i);

      // Estimate gas cost for a single transaction
      let gasPrice = await provider.getFeeData();
      let estimatedGasLimit = BigInt(200000); // Conservative estimate for swap
      let gasCost = gasPrice.gasPrice * estimatedGasLimit;
      let totalCost = i + gasCost * BigInt(global.maxTransaction);

      if (balance < totalCost) {
        logger(`System | Warning: ${$} | Insufficient balance (${balanceEth} PHRS) for ${global.maxTransaction} swaps of ${amountStr} PHRS plus gas`);
        continue;
      }

      let s = contract.WPHRS.slice(2).padStart(64, "0") + contract.USDT.slice(2).padStart(64, "0");
      let n = i.toString(16).padStart(64, "0");
      let l =
        "0x04e45aaf" +
        s +
        "0000000000000000000000000000000000000000000000000000000000000bb8" +
        o.toLowerCase().slice(2).padStart(64, "0") +
        n +
        "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
      let c = Math.floor(Date.now() / 1e3) + 600;
      let d = ["function multicall(uint256 deadline, bytes[] calldata data) payable"];
      let p = new e.Contract(contract.SWAP, d, r);
      let f = p.interface.encodeFunctionData("multicall", [c, [l]]);

      for (let w = 1; w <= global.maxTransaction; w++) {
        logger(`System | ${$} | Initiating Swap ${amountStr} PHRS to USDT (${w}/${global.maxTransaction})`);

        let success = false;
        let attempt = 0;

        while (!success && attempt < maxRetries) {
          try {
            attempt++;
            let g = {
              to: p.target,
              data: f,
              value: i,
            };

            // Estimate gas with retry
            let gasLimit;
            try {
              gasLimit = (await provider.estimateGas(g)) * 12n / 10n; // 20% buffer
            } catch (gasError) {
              if (attempt < maxRetries) {
                logger(`System | ${$} | Gas estimation failed (attempt ${attempt}/${maxRetries}): ${chalk.yellow(gasError.message)}. Retrying in ${retryDelay / 1000} seconds...`);
                await etc.delay(retryDelay);
                continue;
              } else {
                throw new Error(`Gas estimation failed after ${maxRetries} attempts: ${gasError.message}`);
              }
            }

            g.gasLimit = gasLimit;

            // Send transaction
            let m = await r.sendTransaction(g);
            let receipt = await m.wait(1);
            logger(`System | ${$} | ${etc.timelog()} | Swap Confirmed: ${chalk.green(pharos.explorer.tx(m.hash))}`);
            success = true;
          } catch (u) {
            if (attempt < maxRetries) {
              logger(`System | ${$} | Swap attempt ${attempt}/${maxRetries} failed: ${chalk.yellow(u.message)}. Retrying in ${retryDelay / 1000} seconds...`);
              await etc.delay(retryDelay);
              continue;
            } else {
              logger(`System | ${$} | ${etc.timelog()} | Swap failed after ${maxRetries} attempts: ${chalk.red(u.message)}`);
              break;
            }
          }
        }

        if (!success) {
          logger(`System | ${$} | Skipping remaining swaps due to repeated failures`);
          break;
        }

        await etc.delay(transactionDelay);
      }
    } catch (u) {
      logger(`System | ${$} | ${etc.timelog()} | Error: ${chalk.red(u.message)}`);
    }
  }
}

async function addLiquidityUSDCUSDT(logger) {
  for (let a of global.selectedWallets || []) {
    let { privatekey: t, name: $ } = a;
    if (!t) {
      logger(`System | Warning: Skipping ${$ || "wallet with missing data"} due to missing private key`);
      continue;
    }
    try {
      let provider = new e.JsonRpcProvider(RPC_URL, { chainId: 688688, name: "pharos-testnet" });
      let r = new e.Wallet(t, provider);
      let o = r.address;

      // Check wallet balance
      let balance = await provider.getBalance(o);
      let balanceEth = e.formatEther(balance);
      logger(`System | ${$} | Wallet balance: ${balanceEth} PHRS`);

      // We'll add liquidity with 0.0001 PHRS each side, adjust as needed
      let i = e.parseEther("0.0001");
      let amountStr = e.formatEther(i);

      // Prepare the add liquidity function call data
      let abiAddLiquidity = [
        "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)"
      ];

      let contractInstance = new e.Contract(contract.SWAP, abiAddLiquidity, r);

      let deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now

      for (let w = 1; w <= global.maxTransaction; w++) {
        logger(`System | ${$} | Adding liquidity of ${amountStr} USDC and ${amountStr} USDT (${w}/${global.maxTransaction})`);

        try {
          let tx = await contractInstance.addLiquidity(
            contract.USDC,
            contract.USDT,
            i,
            i,
            0,
            0,
            o,
            deadline,
            {
              gasLimit: 250000,
            }
          );

          let receipt = await tx.wait(1);
          logger(`System | ${$} | ${etc.timelog()} | Add Liquidity Confirmed: ${chalk.green(pharos.explorer.tx(tx.hash))}`);
        } catch (err) {
          logger(`System | ${$} | ${etc.timelog()} | Add Liquidity Failed: ${chalk.red(err.message)}`);
          break;
        }

        await etc.delay(3000);
      }
    } catch (err) {
      logger(`System | ${$} | ${etc.timelog()} | Error: ${chalk.red(err.message)}`);
    }
  }
}

export {
  getRandomAmount,
  maskAddress,
  askQuestion,
  performSwapUSDC,
  performSwapUSDT,
  addLiquidityUSDCUSDT,
};
async function socialTask(logger) {
  let a = [201, 202, 203, 204];
  for (let t of global.selectedWallets || []) {
    let { privatekey: $, token: r, name: o } = t;
    if (!$ || !r) {
      logger(`System | Warning: Skipping ${o || "wallet with missing data"} due to missing data`);
      continue;
    }
    let i = new e.Wallet($, pharos.provider());
    for (let s of a) {
      try {
        logger(`System | ${o} | Verifying task ${s} for ${i.address}`);
        let n = qs.stringify({
          address: i.address,
          task_id: s,
        });
        let l = await axios.post("https://api.pharosnetwork.xyz/task/verify", n, {
          headers: {
            ...etc.headers,
            authorization: `Bearer ${r}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });
        let c = l.data;
        if (0 === c.code && c.data?.verified) {
          logger(`System | ${o} | ${etc.timelog()} | Task ${s} verified successfully for ${i.address}`);
        } else {
          logger(`System | ${o} | ${etc.timelog()} | Task ${s} verification failed: ${chalk.red(c.msg || "Unknown error")}`);
        }
      } catch (d) {
        if (axios.isAxiosError(d)) {
          let p = d.response?.data?.msg || d.message;
          logger(`System | ${o} | ${etc.timelog()} | Task ${s} HTTP Error: ${chalk.red(p)}`);
        } else {
          logger(`System | ${o} | ${etc.timelog()} | Task ${s} Unexpected error: ${chalk.red(d.message)}`);
        }
      }
      await etc.countdown(15e3, "Countdown");
    }
  }
}

async function accountClaimFaucet(logger) {
  for (let a of global.selectedWallets || []) {
    let { privatekey: t, token: $, name: r } = a;
    if (!t || !$) {
      logger(`System | Warning: Skipping ${r || "wallet with missing data"} due to missing data`);
      continue;
    }
    try {
      let o = new e.Wallet(t, pharos.provider());
      logger(`System | ${r} | Checking Faucet status for ${o.address}`);
      let s = {
        ...etc.headers,
        authorization: `Bearer ${$}`,
      };
      let n = await axios.get(`https://api.pharosnetwork.xyz/faucet/status?address=${o.address}`, {
        headers: s,
      });
      let l = n.data;
      if (0 !== l.code || !l.data) {
        logger(`System | ${r} | Faucet status check failed: ${chalk.red(l.msg || "Unknown error")}`);
        continue;
      }
      if (!l.data.is_able_to_faucet) {
        let c = new Date(1e3 * l.data.avaliable_timestamp).toLocaleString("en-US", {
          timeZone: "Asia/Jakarta",
        });
        logger(`System | ${r} | Faucet not available. Next available: ${c}`);
        continue;
      }
      logger(`System | ${r} | Claiming Faucet for ${o.address}`);
      let p = await axios.post(`https://api.pharosnetwork.xyz/faucet/daily?address=${o.address}`, null, {
        headers: s,
      });
      let f = p.data;
      if (0 === f.code) {
        logger(`System | ${r} | Faucet claimed successfully`);
      } else {
        logger(`System | ${r} | Faucet claim failed: ${chalk.red(f.msg || "Unknown error")}`);
      }
    } catch (w) {
      if (axios.isAxiosError(w)) {
        logger(
          `System | ${r} | ${etc.timelog()} | HTTP Error: ${chalk.red(
            `${w.response?.status} - ${w.response?.data?.message || w.message}`
          )}`
        );
      } else {
        logger(`System | ${r} | ${etc.timelog()} | Error: ${chalk.red(w.message)}`);
      }
    }
    await etc.delay(5e3);
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

  // Step 1: Generate wallets
  logger(`System | Initiating wallet generation`);
  logger(`System | --------------------------------------------`);
  const numWallets = parseInt(await askQuestion("How many wallets do you want to create? (0 to skip)", logger));
  if (numWallets > 0) {
    const wallets = [];
    for (let i = 0; i < numWallets; i++) {
      const wallet = e.Wallet.createRandom();
      wallets.push(wallet.privateKey);
      logger(`System | Generated wallet ${i + 1}/${numWallets}: ${chalk.green(maskAddress(wallet.address))}`);
    }
    try {
      fs.appendFileSync("address.txt", wallets.join("\n") + "\n");
      logger(`System | Saved ${numWallets} wallets to address.txt`);
    } catch (e) {
      logger(`System | Error saving to address.txt: ${chalk.red(e.message)}`);
      return;
    }
    logger(`System | --------------------------------------------`);
    await etc.delay(3e3);
  }

  // Step 2: Claim faucets
  let successfulClaims = 0;
  let failedClaims = 0;
  let processedCount = 0;

  if (!fs.existsSync("address.txt")) {
    logger(`System | Warning: address.txt not found. Please generate wallets first.`);
    return;
  }

  const privateKeys = fs.readFileSync("address.txt", "utf8").split("\n").filter(Boolean);
  logger(`System | Total wallets to process for faucet claims: ${privateKeys.length}`);
  logger(`System | --------------------------------------------`);

  for (const privateKey of privateKeys) {
    if (!privateKey) continue;
    processedCount++;
    let walletName = `Wallet${processedCount}`;
    try {
      const wallet = new e.Wallet(privateKey, provider);
      const address = wallet.address;
      logger(`System | ${walletName} | Processing wallet [${processedCount}/${privateKeys.length}]: ${chalk.green(maskAddress(address))}`);

      // Generate login URL
      const message = "pharos";
      const signature = await wallet.signMessage(message);
      const urlLogin = `${BASE_API}/user/login?address=${address}&signature=${signature}&invite_code=${REF_CODE}`;

      // Login
      logger(`System | ${walletName} | Initiating login`);
      let token = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const response = await axios.post(urlLogin, null, {
            headers: { ...headers, Authorization: "Bearer null", "Content-Length": "0" },
            timeout: 120000,
          });
          token = response.data.data.jwt;
          logger(`System | ${walletName} | Login successful`);
          break;
        } catch (e) {
          if (attempt < 4) {
            await etc.delay(5000);
            continue;
          }
          logger(`System | ${walletName} | Login failed: ${chalk.red(e.message)}`);
          failedClaims++;
          continue;
        }
      }
      if (!token) {
        logger(`System | ${walletName} | Skipping faucet claim due to login failure`);
        logger(`System | --------------------------------------------`);
        continue;
      }

      // Check faucet status
      logger(`System | ${walletName} | Checking faucet status`);
      let faucetStatus = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const response = await axios.get(`${BASE_API}/faucet/status?address=${address}`, {
            headers: { ...headers, Authorization: `Bearer ${token}` },
            timeout: 120000,
          });
          faucetStatus = response.data;
          break;
        } catch (e) {
          if (attempt < 4) {
            await etc.delay(5000);
            continue;
          }
          logger(`System | ${walletName} | Failed to get faucet status: ${chalk.red(e.message)}`);
          failedClaims++;
          continue;
        }
      }
      if (!faucetStatus) {
        logger(`System | ${walletName} | Skipping faucet claim due to status check failure`);
        logger(`System | --------------------------------------------`);
        continue;
      }

      if (faucetStatus.msg === "ok" && faucetStatus.data?.is_able_to_faucet) {
        logger(`System | ${walletName} | Initiating faucet claim`);
        let claim = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const response = await axios.post(`${BASE_API}/faucet/daily?address=${address}`, null, {
              headers: { ...headers, Authorization: `Bearer ${token}`, "Content-Length": "0" },
              timeout: 120000,
            });
            claim = response.data;
            break;
          } catch (e) {
            if (e.response?.data) {
              claim = e.response.data;
              break;
            }
            if (attempt < 4) {
              await etc.delay(5000);
              continue;
            }
            logger(`System | ${walletName} | Faucet claim failed: ${chalk.red(e.message)}`);
            failedClaims++;
            continue;
          }
        }
        if (claim?.msg === "ok") {
          logger(`System | ${walletName} | ${etc.timelog()} | Faucet claimed successfully: ${chalk.green("0.2 PHRS")}`);
          successfulClaims++;
        } else {
          logger(`System | ${walletName} | Faucet claim failed: ${chalk.red(claim?.data?.message || "Unknown error")}`);
          failedClaims++;
        }
      } else {
        const faucetAvailableWib = new Date(faucetStatus.data?.avaliable_timestamp * 1000).toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        logger(`System | ${walletName} | Faucet not available. Next available: ${faucetAvailableWib}`);
        failedClaims++;
      }
      logger(`System | --------------------------------------------`);
    } catch (e) {
      logger(`System | ${walletName} | ${etc.timelog()} | Error: ${chalk.red(e.message)}`);
      failedClaims++;
      logger(`System | --------------------------------------------`);
    }
    await etc.delay(3e3);
  }

  logger(`System | Faucet Claim Summary: Successful: ${chalk.green(successfulClaims)}, Failed: ${chalk.red(failedClaims)}`);
  logger(`System | --------------------------------------------`);

  // Step 3: Transfer funds to main wallet
  if (!fs.existsSync("wallet.txt")) {
    logger(`System | Warning: wallet.txt not found. Skipping transfers.`);
    return;
  }

  const destAddress = fs.readFileSync("wallet.txt", "utf8").trim();
  if (!e.isAddress(destAddress)) {
    logger(`System | Warning: Invalid wallet address in wallet.txt. Skipping transfers.`);
    return;
  }

  let successfulTransfers = 0;
  let failedTransfers = 0;
  processedCount = 0;

  logger(`System | Initiating transfers to main wallet: ${chalk.green(maskAddress(destAddress))}`);
  logger(`System | --------------------------------------------`);

  for (const privateKey of privateKeys) {
    if (!privateKey) continue;
    processedCount++;
    let walletName = `Wallet${processedCount}`;
    try {
      const wallet = new e.Wallet(privateKey, provider);
      const address = wallet.address;
      logger(`System | ${walletName} | Processing transfer [${processedCount}/${privateKeys.length}]: ${chalk.green(maskAddress(address))}`);

      const balance = await provider.getBalance(address);
      const balanceEth = e.formatEther(balance);
      logger(`System | ${walletName} | Balance: ${balanceEth} PHRS`);

      if (parseFloat(balanceEth) <= 0) {
        logger(`System | ${walletName} | No funds to transfer`);
        failedTransfers++;
        logger(`System | --------------------------------------------`);
        continue;
      }

      logger(`System | ${walletName} | Initiating transfer`);
      const gasPrice = await provider.getFeeData();
      const gasLimit = 21000;
      const gasCost = gasPrice.gasPrice * BigInt(gasLimit);
      const amountToSend = balance - gasCost;

      if (amountToSend <= 0) {
        logger(`System | ${walletName} | Balance too low to cover gas fees`);
        failedTransfers++;
        logger(`System | --------------------------------------------`);
        continue;
      }

      const tx = await wallet.sendTransaction({
        to: destAddress,
        value: amountToSend,
        gasLimit: gasLimit,
      });
      logger(`System | ${walletName} | Transaction sent: ${chalk.green(pharos.explorer.tx(tx.hash))}`);
      await tx.wait();
      logger(`System | ${walletName} | ${etc.timelog()} | Transfer Confirmed: ${chalk.green(pharos.explorer.tx(tx.hash))}`);
      successfulTransfers++;
      logger(`System | --------------------------------------------`);
    } catch (e) {
      logger(`System | ${walletName} | ${etc.timelog()} | Transfer failed: ${chalk.red(e.message)}`);
      failedTransfers++;
      logger(`System | --------------------------------------------`);
    }
    await etc.delay(3e3);
  }

  logger(`System | Transfer Summary: Successful: ${chalk.green(successfulTransfers)}, Failed: ${chalk.red(failedTransfers)}`);
  logger(`System | --------------------------------------------`);
}

module.exports = {
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
  unlimitedFaucet,
};
