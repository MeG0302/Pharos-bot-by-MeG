import chalk from "chalk";
import path from "path";
import fs from "fs";
import readline from "readline";

import { fileURLToPath } from "url";
import { dirname } from "path";

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import service.js as ES module
import * as service from "./service.js";  // <-- note .js extension and ESM import

// Menu Options
const menuOptions = [
  { label: "Login", value: "accountLogin" },
  { label: "Check-in", value: "accountCheckIn" },
  { label: "Check Balance", value: "accountCheck" },
  { label: "Claim PHRS", value: "accountClaimFaucet" },
  { label: "Claim USDC", value: "claimFaucetUSDC" },
  { label: "Swap PHRS ➜ USDC", value: "performSwapUSDC" },
  { label: "Swap PHRS ➜ USDT", value: "performSwapUSDT" },
  { label: "Add LP PHRS-USDC", value: "addLpUSDC" },
  { label: "Add LP PHRS-USDT", value: "addLpUSDT" },
  { label: "Random Transfer", value: "randomTransfer" },
  { label: "Social Task", value: "socialTask" },
  { label: "Set Tx Count", value: "setTransactionCount" },
  { label: "Exit", value: "exit" },
];

// Global State
global.selectedWallets = [];
global.maxTransaction = 5;

// Read wallets from wallet.json
function loadWallets() {
  try {
    const data = fs.readFileSync(path.join(__dirname, "wallet.json"), "utf8");
    global.selectedWallets = JSON.parse(data).wallets || [];
    return global.selectedWallets;
  } catch {
    return [];
  }
}

// Display banner
function displayBanner() {
  console.clear();
  console.log(chalk.cyan.bold(`
==============================
      MeG Testnet Toolkit
==============================
  Multiple Wallet Support ✓
  Auto Faucet, Swap, LP ✓
------------------------------
  Wallets Loaded: ${global.selectedWallets.length}
`));
}

// Log message
function log(msg) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(chalk.gray(`[${time}]`), chalk.white(msg));
}

// CLI Prompt
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(prompt, type = "text", defaultVal = "") {
  return new Promise((resolve) => {
    rl.question(chalk.green(`${prompt}${defaultVal ? ` [${defaultVal}]` : ""}: `), (val) => {
      if (type === "number") val = Number(val);
      if (!val) val = defaultVal;
      resolve(val);
    });
  });
}

// Menu Display
function showMenu() {
  console.log(chalk.magenta("\n--- Select Action ---"));
  menuOptions.forEach((opt, i) => {
    console.log(chalk.magenta(`${String(i + 1).padStart(2, "0")}. ${opt.label}`));
  });
}

// Spinner
function spinner(msg) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${chalk.green(frames[i++ % frames.length])} ${chalk.green(msg)} `);
  }, 100);
  return { stop: () => { clearInterval(interval); process.stdout.write("\r\x1b[K"); } };
}

// Main Logic
async function main() {
  loadWallets();
  displayBanner();

  const txCount = await ask("Max transactions per wallet", "number", "5");
  global.maxTransaction = isNaN(txCount) || txCount <= 0 ? 5 : txCount;

  while (true) {
    displayBanner();
    showMenu();
    const input = await ask("Choose option", "number");
    const choice = menuOptions[Number(input) - 1];

    if (!choice) {
      log("Invalid option. Try again.");
      continue;
    }

    if (choice.value === "exit") {
      rl.close();
      process.exit(0);
    }

    if (choice.value === "setTransactionCount") {
      const newCount = await ask("New transaction count", "number", global.maxTransaction);
      global.maxTransaction = isNaN(newCount) || newCount <= 0 ? global.maxTransaction : newCount;
      log(`Transaction count updated: ${global.maxTransaction}`);
      continue;
    }

    try {
      const spin = spinner(`Running ${choice.label}`);
      const fn = service[choice.value];
      if (fn) {
        await fn(log);
        log(`${choice.label} completed.`);
      } else {
        log(`Function not implemented.`);
      }
      spin.stop();
    } catch (err) {
      log(`Error: ${err.message}`);
    }

    await ask("Press Enter to continue...");
  }
}

main();
