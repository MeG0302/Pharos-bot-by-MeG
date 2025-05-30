import fs from "fs";
import path from "path";
import qs from "querystring";
import { ethers as e } from "ethers";
import chalkImport from "chalk";
const chalk = chalkImport.default || chalkImport;
import axios from "axios";
import FakeUserAgent from "fake-useragent";
import chains from "./chains.js";  // Note: add `.js` extension in ES modules

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

// Utility to mask address (e.g., 0x123456******abcdef)
function maskAddress(address) {
  return address ? `${address.slice(0, 6)}${'*'.repeat(6)}${address.slice(-6)}` : "Unknown";
}

// Utility to prompt user input from console with colorized question
async function askQuestion(question, logger) {
  const readline = require("readline");
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
  const maxRetries = 3;
  const retryDelay = 5000; // ms
  const transactionDelay = 3000; // ms

  for (const wallet of global.selectedWallets || []) {
    const { privatekey, name } = wallet;
    if (!privatekey) {
      logger(`System | Warning: Skipping ${name || "wallet with missing data"} due to missing private key`);
      continue;
    }

    try {
      const provider = new e.JsonRpcProvider(RPC_URL, { chainId: 688688, name: "pharos-testnet" });
      const signer = new e.Wallet(privatekey, provider);
      const address = signer.address;

      // Check wallet balance
      const balance = await provider.getBalance(address);
      const balanceEth = e.formatEther(balance);
      logger(`System | ${name} | Wallet balance: ${balanceEth} PHRS`);

      const swapAmount = getRandomAmount(0.0001, 0.0003);
      const amountStr = e.formatEther(swapAmount);

      // Gas estimation & total cost check
      const feeData = await provider.getFeeData();
      const estimatedGasLimit = 200000n;
      const gasCost = feeData.gasPrice * estimatedGasLimit;
      const totalCost = swapAmount + gasCost * BigInt(global.maxTransaction);

      if (balance < totalCost) {
        logger(`System | Warning: ${name} | Insufficient balance (${balanceEth} PHRS) for ${global.maxTransaction} swaps of ${amountStr} PHRS plus gas`);
        continue;
      }

      // Prepare calldata for multicall swap (WPHRS -> USDC)
      const tokensEncoded =
        contract.WPHRS.slice(2).padStart(64, "0") +
        contract.USDC.slice(2).padStart(64, "0");
      const amountEncoded = swapAmount.toString(16).padStart(64, "0");
      const recipientEncoded = address.toLowerCase().slice(2).padStart(64, "0");
      const deadline = Math.floor(Date.now() / 1000) + 600; // +10 minutes

      const calldata =
        "0x04e45aaf" +
        tokensEncoded +
        "0000000000000000000000000000000000000000000000000000000000000bb8" + // fixed amount? 
        recipientEncoded +
        amountEncoded +
        "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

      const contractInterface = ["function multicall(uint256 deadline, bytes[] calldata data) payable"];
      const swapContract = new e.Contract(contract.SWAP, contractInterface, signer);
      const encodedData = swapContract.interface.encodeFunctionData("multicall", [deadline, [calldata]]);

      for (let i = 1; i <= global.maxTransaction; i++) {
        logger(`System | ${name} | Initiating Swap ${amountStr} PHRS to USDC (${i}/${global.maxTransaction})`);

        let success = false;
        let attempt = 0;

        while (!success && attempt < maxRetries) {
          try {
            attempt++;

            const txRequest = {
              to: swapContract.target,
              data: encodedData,
              value: swapAmount,
            };

            // Gas estimation with retries
            let gasLimit;
            try {
              gasLimit = (await provider.estimateGas(txRequest) * 12n) / 10n; // +20% buffer
            } catch (gasError) {
              if (attempt < maxRetries) {
                logger(`System | ${name} | Gas estimation failed (attempt ${attempt}/${maxRetries}): ${chalk.yellow(gasError.message)}. Retrying in ${retryDelay / 1000}s...`);
                await etc.delay(retryDelay);
                continue;
              } else {
                throw new Error(`Gas estimation failed after ${maxRetries} attempts: ${gasError.message}`);
              }
            }

            txRequest.gasLimit = gasLimit;

            const txResponse = await signer.sendTransaction(txRequest);
            await txResponse.wait(1);

            logger(`System | ${name} | ${etc.timelog()} | Swap Confirmed: ${chalk.green(pharos.explorer.tx(txResponse.hash))}`);
            success = true;
          } catch (error) {
            if (attempt < maxRetries) {
              logger(`System | ${name} | Swap attempt ${attempt}/${maxRetries} failed: ${chalk.yellow(error.message)}. Retrying in ${retryDelay / 1000}s...`);
              await etc.delay(retryDelay);
            } else {
              logger(`System | ${name} | ${etc.timelog()} | Swap failed after ${maxRetries} attempts: ${chalk.red(error.message)}`);
              break;
            }
          }
        }

        if (!success) {
          logger(`System | ${name} | Skipping remaining swaps due to repeated failures`);
          break;
        }

        await etc.delay(transactionDelay);
      }
    } catch (error) {
      logger(`System | ${name} | ${etc.timelog()} | Error: ${chalk.red(error.message)}`);
    }
  }
}

async function performSwapUSDT(logger) {
  // Very similar to performSwapUSDC; only difference is token USDT instead of USDC.
  // Consider abstracting repeated code into a helper function.
  
  const maxRetries = 3;
  const retryDelay = 5000;
  const transactionDelay = 3000;

  for (const wallet of global.selectedWallets || []) {
    const { privatekey, name } = wallet;
    if (!privatekey) {
      logger(`System | Warning: Skipping ${name || "wallet with missing data"} due to missing private key`);
      continue;
    }

    try {
      const provider = new e.JsonRpcProvider(RPC_URL, { chainId: 688688, name: "pharos-testnet" });
      const signer = new e.Wallet(privatekey, provider);
      const address = signer.address;

      const balance = await provider.getBalance(address);
      const balanceEth = e.formatEther(balance);
      logger(`System | ${name} | Wallet balance: ${balanceEth} PHRS`);

      const swapAmount = getRandomAmount(0.0001, 0.0003);
      const amountStr = e.formatEther(swapAmount);

      const feeData = await provider.getFeeData();
      const estimatedGasLimit = 200000n;
      const gasCost = feeData.gasPrice * estimatedGasLimit;
      const totalCost = swapAmount + gasCost * BigInt(global.maxTransaction);

      if (balance < totalCost) {
        logger(`System | Warning: ${name} | Insufficient balance (${balanceEth} PHRS) for ${global.maxTransaction} swaps of ${amountStr} PHRS plus gas`);
        continue;
      }

      const tokensEncoded =
        contract.WPHRS.slice(2).padStart(64, "0") +
        contract.USDT.slice(2).padStart(64, "0");
      const amountEncoded = swapAmount.toString(16).padStart(64, "0");
      const recipientEncoded = address.toLowerCase().slice(2).padStart(64, "0");
      const deadline = Math.floor(Date.now() / 1000) + 600;

      const calldata =
        "0x04e45aaf" +
        tokensEncoded +
        "0000000000000000000000000000000000000000000000000000000000000bb8" +
        recipientEncoded +
        amountEncoded +
        "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

      const contractInterface = ["function multicall(uint256 deadline, bytes[] calldata data) payable"];
      const swapContract = new e.Contract(contract.SWAP, contractInterface, signer);
      const encodedData = swapContract.interface.encodeFunctionData("multicall", [deadline, [calldata]]);

      for (let i = 1; i <= global.maxTransaction; i++) {
        logger(`System | ${name} | Initiating Swap ${amountStr} PHRS to USDT (${i}/${global.maxTransaction})`);

        let success = false;
        let attempt = 0;

        while (!success && attempt < maxRetries) {
          try {
            attempt++;

            const txRequest = {
              to: swapContract.target,
              data: encodedData,
              value: swapAmount,
            };

            let gasLimit;
            try {
              gasLimit = (await provider.estimateGas(txRequest) * 12n) / 10n;
            } catch (gasError) {
              if (attempt < maxRetries) {
                logger(`System | ${name} | Gas estimation failed (attempt ${attempt}/${maxRetries}): ${chalk.yellow(gasError.message)}. Retrying in ${retryDelay / 1000}s...`);
                await etc.delay(retryDelay);
                continue;
              } else {
                throw new Error(`Gas estimation failed after ${maxRetries} attempts: ${gasError.message}`);
              }
            }

            txRequest.gasLimit = gasLimit;

            const txResponse = await signer.sendTransaction(txRequest);
            await txResponse.wait(1);

            logger(`System | ${name} | ${etc.timelog()} | Swap Confirmed: ${chalk.green(pharos.explorer.tx(txResponse.hash))}`);
            success = true;
          } catch (error) {
            if (attempt < maxRetries) {
              logger(`System | ${name} | Swap attempt ${attempt}/${maxRetries} failed: ${chalk.yellow(error.message)}. Retrying in ${retryDelay / 1000}s...`);
              await etc.delay(retryDelay);
            } else {
              logger(`System | ${name} | ${etc.timelog()} | Swap failed after ${maxRetries} attempts: ${chalk.red(error.message)}`);
              break;
            }
          }
        }

        if (!success) {
          logger(`System | ${name} | Skipping remaining swaps due to repeated failures`);
          break;
        }

        await etc.delay(transactionDelay);
      }
    } catch (error) {
      logger(`System | ${name} | ${etc.timelog()} | Error: ${chalk.red(error.message)}`);
    }
  }
}

// Helper to generate a random BigNumber amount between min and max (in ETH units)
function getRandomAmount(minEth, maxEth) {
  const min = BigInt(Math.floor(minEth * 1e18));
  const max = BigInt(Math.floor(maxEth * 1e18));
  const random = min + BigInt(Math.floor(Math.random() * Number(max - min)));
  return e.parseUnits(random.toString(), 0);
}


async function socialTask(logger) {
  const taskIds = [201, 202, 203, 204];
  for (const wallet of global.selectedWallets || []) {
    const { privatekey: privKey, token: token, name } = wallet;
    if (!privKey || !token) {
      logger(`System | Warning: Skipping ${name || "wallet with missing data"} due to missing data`);
      continue;
    }
    const signer = new e.Wallet(privKey, pharos.provider());
    for (const taskId of taskIds) {
      try {
        logger(`System | ${name} | Verifying task ${taskId} for ${signer.address}`);
        const params = qs.stringify({ address: signer.address, task_id: taskId });
        // Retry the request up to 3 times on failure
        let verified = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const res = await axios.post("https://api.pharosnetwork.xyz/task/verify", params, {
              headers: {
                ...etc.headers,
                authorization: `Bearer ${token}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
            });
            const data = res.data;
            if (data.code === 0 && data.data?.verified) {
              logger(`System | ${name} | ${etc.timelog()} | Task ${taskId} verified successfully for ${signer.address}`);
              verified = true;
            } else {
              logger(`System | ${name} | ${etc.timelog()} | Task ${taskId} verification failed: ${chalk.red(data.msg || "Unknown error")}`);
            }
            break; // break retry loop if success or known failure
          } catch (err) {
            if (attempt === 3) throw err;
            logger(`System | ${name} | Retry ${attempt}/3 failed for task ${taskId}: ${chalk.yellow(err.message)}. Retrying...`);
            await etc.delay(3000);
          }
        }
        if (!verified) {
          logger(`System | ${name} | ${etc.timelog()} | Task ${taskId} not verified after retries.`);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const msg = error.response?.data?.msg || error.message;
          logger(`System | ${name} | ${etc.timelog()} | Task ${taskId} HTTP Error: ${chalk.red(msg)}`);
        } else {
          logger(`System | ${name} | ${etc.timelog()} | Task ${taskId} Unexpected error: ${chalk.red(error.message)}`);
        }
      }
      await etc.delay(15000);
    }
  }
}

async function accountClaimFaucet(logger) {
  for (const wallet of global.selectedWallets || []) {
    const { privatekey: privKey, token: token, name } = wallet;
    if (!privKey || !token) {
      logger(`System | Warning: Skipping ${name || "wallet with missing data"} due to missing data`);
      continue;
    }
    try {
      const signer = new e.Wallet(privKey, pharos.provider());
      logger(`System | ${name} | Checking Faucet status for ${signer.address}`);
      const headers = { ...etc.headers, authorization: `Bearer ${token}` };

      // Retry faucet status check up to 3 times
      let faucetStatus;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await axios.get(`https://api.pharosnetwork.xyz/faucet/status?address=${signer.address}`, { headers });
          faucetStatus = res.data;
          break;
        } catch (err) {
          if (attempt === 3) throw err;
          logger(`System | ${name} | Faucet status check attempt ${attempt} failed: ${chalk.yellow(err.message)}. Retrying...`);
          await etc.delay(3000);
        }
      }

      if (faucetStatus.code !== 0 || !faucetStatus.data) {
        logger(`System | ${name} | Faucet status check failed: ${chalk.red(faucetStatus.msg || "Unknown error")}`);
        continue;
      }

      if (!faucetStatus.data.is_able_to_faucet) {
        const nextAvailable = new Date(1e3 * faucetStatus.data.avaliable_timestamp).toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        logger(`System | ${name} | Faucet not available. Next available: ${nextAvailable}`);
        continue;
      }

      logger(`System | ${name} | Claiming Faucet for ${signer.address}`);

      // Retry faucet claim up to 3 times
      let claimResult;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await axios.post(`https://api.pharosnetwork.xyz/faucet/daily?address=${signer.address}`, null, { headers });
          claimResult = res.data;
          break;
        } catch (err) {
          if (attempt === 3) throw err;
          logger(`System | ${name} | Faucet claim attempt ${attempt} failed: ${chalk.yellow(err.message)}. Retrying...`);
          await etc.delay(3000);
        }
      }

      if (claimResult.code === 0) {
        logger(`System | ${name} | Faucet claimed successfully`);
      } else {
        logger(`System | ${name} | Faucet claim failed: ${chalk.red(claimResult.msg || "Unknown error")}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger(`System | ${name} | ${etc.timelog()} | HTTP Error: ${chalk.red(`${error.response?.status} - ${error.response?.data?.message || error.message}`)}`);
      } else {
        logger(`System | ${name} | ${etc.timelog()} | Error: ${chalk.red(error.message)}`);
      }
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
    await etc.delay(3000);
  }

  if (!fs.existsSync("address.txt")) {
    logger(`System | Warning: address.txt not found. Please generate wallets first.`);
    return;
  }

  const privateKeys = fs.readFileSync("address.txt", "utf8").split("\n").filter(Boolean);
  logger(`System | Total wallets to process for faucet claims: ${privateKeys.length}`);
  logger(`System | --------------------------------------------`);

  let successfulClaims = 0;
  let failedClaims = 0;
  let processedCount = 0;

  for (const privKey of privateKeys) {
    if (!privKey) continue;
    processedCount++;
    const walletName = `Wallet${processedCount}`;
    try {
      const wallet = new e.Wallet(privKey, provider);
      const address = wallet.address;
      logger(`System | ${walletName} | Processing wallet [${processedCount}/${privateKeys.length}]: ${chalk.green(maskAddress(address))}`);

      // Login
      const message = "pharos";
      const signature = await wallet.signMessage(message);
      const urlLogin = `${BASE_API}/user/login?address=${address}&signature=${signature}&invite_code=${REF_CODE}`;

      logger(`System | ${walletName} | Initiating login`);
      let token = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const res = await axios.post(urlLogin, null, {
            headers: { ...headers, Authorization: "Bearer null", "Content-Length": "0" },
            timeout: 120000,
          });
          token = res.data.data.jwt;
          logger(`System | ${walletName} | Login successful`);
          break;
        } catch (e) {
          if (attempt === 5) {
            logger(`System | ${walletName} | Login failed: ${chalk.red(e.message)}`);
            failedClaims++;
          } else {
            logger(`System | ${walletName} | Login attempt ${attempt} failed. Retrying...`);
            await etc.delay(5000);
          }
        }
      }
      if (!token) {
        logger(`System | ${walletName} | Skipping faucet claim due to login failure`);
        logger(`System | --------------------------------------------`);
        continue;
      }

      // Check faucet status
      const urlStatus = `${BASE_API}/faucet/status?address=${address}`;
      let statusData;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await axios.get(urlStatus, { headers: { ...headers, authorization: `Bearer ${token}` } });
          statusData = res.data;
          break;
        } catch (e) {
          if (attempt === 3) {
            logger(`System | ${walletName} | Faucet status check failed: ${chalk.red(e.message)}`);
          } else {
            logger(`System | ${walletName} | Faucet status check attempt ${attempt} failed. Retrying...`);
            await etc.delay(3000);
          }
        }
      }
      if (!statusData || statusData.code !== 0) {
        logger(`System | ${walletName} | Faucet status check failed or unknown response`);
        failedClaims++;
        logger(`System | --------------------------------------------`);
        continue;
      }

      if (!statusData.data.is_able_to_faucet) {
        logger(`System | ${walletName} | Faucet not available now. Next available: ${new Date(1000 * statusData.data.avaliable_timestamp).toLocaleString("id-ID")}`);
        logger(`System | --------------------------------------------`);
        continue;
      }

      // Claim faucet
      const urlClaim = `${BASE_API}/faucet/daily?address=${address}`;
      let claimResult;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await axios.post(urlClaim, null, { headers: { ...headers, authorization: `Bearer ${token}` } });
          claimResult = res.data;
          break;
        } catch (e) {
          if (attempt === 3) {
            logger(`System | ${walletName} | Faucet claim failed: ${chalk.red(e.message)}`);
          } else {
            logger(`System | ${walletName} | Faucet claim attempt ${attempt} failed. Retrying...`);
            await etc.delay(3000);
          }
        }
      }

      if (claimResult && claimResult.code === 0) {
        logger(`System | ${walletName} | Faucet claimed successfully`);
        successfulClaims++;
      } else {
        logger(`System | ${walletName} | Faucet claim failed: ${chalk.red(claimResult?.msg || "Unknown error")}`);
        failedClaims++;
      }
    } catch (error) {
      logger(`System | ${walletName} | Unexpected error: ${chalk.red(error.message)}`);
      failedClaims++;
    }
    logger(`System | --------------------------------------------`);
    await etc.delay(3000);
  }

  logger(`System | Finished faucet claims`);
  logger(`System | Successful claims: ${chalk.green(successfulClaims)}`);
  logger(`System | Failed claims: ${chalk.red(failedClaims)}`);
}
