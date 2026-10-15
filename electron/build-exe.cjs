const fs = require('fs');
const path = require('path');

// Clean any leftover release/ temp folders before building
const releaseDir = path.join(__dirname, '..', 'release');
try {
  fs.rmSync(releaseDir, { recursive: true, force: true });
} catch {}

// Patch fs.promises.rename & fs.rename with automatic retry on Windows EPERM/EBUSY/EACCES
// caused by Windows Defender briefly scanning newly unpacked .exe binaries
const origPromisesRename = fs.promises.rename.bind(fs.promises);
fs.promises.rename = async function retryRename(oldPath, newPath) {
  let lastErr;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      return await origPromisesRename(oldPath, newPath);
    } catch (err) {
      lastErr = err;
      if (err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES')) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
};

// Invoke electron-builder CLI (--win portable)
process.argv = [process.argv[0], process.argv[1], '--win', 'portable'];
require('../node_modules/electron-builder/cli.js');
