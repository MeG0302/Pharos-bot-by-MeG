import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}

function loadModulesFromDir(dir) {
  const modules = {};
  
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isFile() && file.endsWith('.js')) {
      const moduleName = toCamelCase(path.basename(file, '.js'));
      // Use dynamic import for ES modules
      // But since this is sync, you can do:
      // Note: dynamic import returns a Promise, so better to use import() with async function
      // To keep it simple, let's use require() via createRequire:

      // However, for pure ESM you may want to redesign the approach or use async import.

      // For now, if all the files are CommonJS, you can keep this as is,
      // but then your index.js has to be CommonJS (or run the entire app in CommonJS).

      // Alternatively, here is a sync require workaround for ESM:

      // Create require function in ESM:
      // import { createRequire } from 'module';
      // const require = createRequire(import.meta.url);
      // then:
      // modules[moduleName] = require(fullPath);

      // So let's do that:
    }
  }
  return modules;
}

// To fix the require in ESM, add:
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const testnetChains = loadModulesFromDir(path.join(__dirname, 'testnet'));
const mainnetChains = loadModulesFromDir(path.join(__dirname, 'mainnet'));
const utilsChains = loadModulesFromDir(path.join(__dirname, 'utils'));

export default {
  testnet: testnetChains,
  mainnet: mainnetChains,
  utils: utilsChains,
};
