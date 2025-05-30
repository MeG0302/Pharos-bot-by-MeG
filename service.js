// service.js

import axios from "axios";
import qs from "qs";
import fs from "fs";
import chalk from "chalk";
import { ethers as e } from "ethers";
import FakeUserAgent from "fake-useragent";

// ✅ Corrected path to utils.js inside chains/utils/
import { maskAddress, etc, pharos, BASE_API, REF_CODE, RPC_URL } from "./chains/utils/utils.js";

// ✅ Same file for contract addresses
import { ROUTER, WPHRS, USDC, USDT, SWAP } from "./chains/utils/utils.js";



/**
 * Claim USDC faucet for each wallet in global.selectedWallets
 */
async function claimFaucetUSDC(logger) {
  for (let a of global.selectedWallets || []) {
    let { privatekey: t, name: $ } = a;
    if (!t) {
      logger(`System | Warning: Skipping ${$ || "wallet with missing private key"} due to missing private key`);
      continue;
    }
    let r = new e.Wallet(t, pharos.provider());
    try {
      logger(`System | ${$} | Claiming USDC for ${r.address}`);
      let o = await axios.post(
        "https://testnet-router.zenithswap.xyz/api/v1/faucet",
        {
          tokenAddress: "0xAD902CF99C2dE2f1Ba5ec4D642Fd7E49cae9EE37",
          userAddress: r.address,
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...etc.headers,
          },
        }
      );
      let i = o.data;
      if (200 === i.status && i.data?.txHash) {
        logger(`System | ${$} | ${etc.timelog()} | USDC Claimed | TxHash: ${chalk.green(pharos.explorer.tx(i.data.txHash))}`);
      } else {
        logger(`System | ${$} | ${etc.timelog()} | USDC Claim failed: ${chalk.red(i.message || "Unknown error")}`);
      }
    } catch (s) {
      if (axios.isAxiosError(s)) {
        let n = s.response?.data?.message || s.message;
        logger(`System | ${$} | ${etc.timelog()} | USDC Claim Error: ${chalk.red(n)}`);
      } else {
        logger(`System | ${$} | ${etc.timelog()} | USDC Claim Unexpected error: ${chalk.red(s.message)}`);
      }
    }
    await etc.delay(5e3);
  }
}

/**
 * Verify social tasks for each wallet in global.selectedWallets
 */
async function socialTask(logger) {
  let taskIds = [201, 202, 203, 204];
  for (let t of global.selectedWallets || []) {
    let { privatekey: $, token: r, name: o } = t;
    if (!$ || !r) {
      logger(`System | Warning: Skipping ${o || "wallet with missing data"} due to missing data`);
      continue;
    }
    let i = new e.Wallet($, pharos.provider());
    for (let s of taskIds) {
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

/**
 * Check faucet status and claim if possible for each wallet in global.selectedWallets
 */
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

/**
 * Unlimited faucet claim service with wallet generation, claiming, and transfer to main wallet
 */
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
          const statusResponse = await axios.get(`${BASE_API}/faucet/status?address=${address}`, {
            headers: { ...headers, authorization: `Bearer ${token}` },
            timeout: 120000,
          });
          faucetStatus = statusResponse.data;
          if (faucetStatus.code === 0) {
            break;
          }
        } catch (e) {
          if (attempt < 4) {
            await etc.delay(2000);
            continue;
          }
          logger(`System | ${walletName} | Faucet status check failed: ${chalk.red(e.message)}`);
          faucetStatus = null;
        }
      }
      if (!faucetStatus || faucetStatus.code !== 0) {
        logger(`System | ${walletName} | Faucet status unavailable, skipping faucet claim`);
        logger(`System | --------------------------------------------`);
        continue;
      }

      if (!faucetStatus.data.is_able_to_faucet) {
        const nextAvailable = new Date(faucetStatus.data.avaliable_timestamp * 1000).toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
        logger(`System | ${walletName} | Faucet not available, next available: ${nextAvailable}`);
        logger(`System | --------------------------------------------`);
        continue;
      }

      // Claim faucet
      logger(`System | ${walletName} | Claiming faucet`);
      try {
        const claimResponse = await axios.post(`${BASE_API}/faucet/daily?address=${address}`, null, {
          headers: { ...headers, authorization: `Bearer ${token}` },
          timeout: 120000,
        });
        if (claimResponse.data.code === 0) {
          logger(`System | ${walletName} | Faucet claimed successfully`);
          successfulClaims++;
        } else {
          logger(`System | ${walletName} | Faucet claim failed: ${chalk.red(claimResponse.data.msg)}`);
          failedClaims++;
        }
      } catch (e) {
        logger(`System | ${walletName} | Faucet claim error: ${chalk.red(e.message)}`);
        failedClaims++;
      }
    } catch (e) {
      logger(`System | ${walletName} | Unexpected error: ${chalk.red(e.message)}`);
      failedClaims++;
    }
    logger(`System | --------------------------------------------`);
    await etc.delay(5000);
  }

  logger(`System | Faucet Claim Summary: ${chalk.green(successfulClaims)} successful, ${chalk.red(failedClaims)} failed`);

  // Step 3: Transfer funds to main wallet
  logger(`System | Initiating fund transfer to main wallet`);
  if (!fs.existsSync("wallet.txt")) {
    logger(`System | main wallet address file (wallet.txt) missing. Cannot transfer funds.`);
    return;
  }
  const mainWalletAddress = fs.readFileSync("wallet.txt", "utf8").trim();
  if (!mainWalletAddress) {
    logger(`System | main wallet address is empty in wallet.txt`);
    return;
  }

  let transferCount = 0;
  let transferFailCount = 0;

  for (const privateKey of privateKeys) {
    if (!privateKey) continue;
    try {
      const wallet = new e.Wallet(privateKey, provider);
      const balance = await provider.getBalance(wallet.address);

      if (balance.lte(0)) {
        logger(`System | Wallet ${maskAddress(wallet.address)} balance is zero, skipping transfer`);
        continue;
      }

      const gasPrice = await provider.getGasPrice();
      const gasLimit = e.BigNumber.from("21000"); // ETH transfer gas limit

      const gasCost = gasPrice.mul(gasLimit);
      if (balance.lte(gasCost)) {
        logger(`System | Wallet ${maskAddress(wallet.address)} balance too low to cover gas fees, skipping`);
        continue;
      }

      const amountToSend = balance.sub(gasCost);
      logger(`System | Transferring ${e.utils.formatEther(amountToSend)} ETH from ${maskAddress(wallet.address)} to main wallet`);

      const tx = await wallet.sendTransaction({
        to: mainWalletAddress,
        value: amountToSend,
        gasLimit,
        gasPrice,
      });
      await tx.wait();

      logger(`System | Transfer successful: TxHash: ${chalk.green(pharos.explorer.tx(tx.hash))}`);
      transferCount++;
    } catch (e) {
      logger(`System | Transfer failed for wallet ${maskAddress(privateKey)}: ${chalk.red(e.message)}`);
      transferFailCount++;
    }
  }

  logger(`System | Transfer Summary: ${chalk.green(transferCount)} successful, ${chalk.red(transferFailCount)} failed`);
}

module.exports = {
  claimFaucetUSDC,
  socialTask,
  accountClaimFaucet,
  unlimitedFaucet,
};
