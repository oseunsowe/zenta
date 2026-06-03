// Robust clean: kill stale runner processes that may lock dist/, then remove dist/.
// Idempotent and safe to run when dist/ doesn't exist.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dist = path.resolve(__dirname, '..', 'dist');

function killStale() {
  if (process.platform !== 'win32') return;
  const names = [
    'Workspace Helper.exe',
    'Echoface Stealth.exe',
    'backend-runner.exe',
  ];
  for (const name of names) {
    spawnSync('taskkill', ['/F', '/IM', name], { stdio: 'ignore', shell: true });
  }
}

function tryRemove(attempt = 1) {
  try {
    fs.rmSync(dist, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    if (err.code === 'EBUSY' && attempt < 3) {
      killStale();
      return setTimeout(() => tryRemove(attempt + 1), 500);
    }
    throw err;
  }
}

killStale();
tryRemove();
console.log('[clean] dist/ removed');
