// Builds the bundled backend exe via pyinstaller and stages it in desktop/resources.
// Run automatically by `npm run pack` / `npm run dist` via the prepack/predist hooks.
// Skip with HOST_SKIP_BACKEND_BUILD=1.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.env.HOST_SKIP_BACKEND_BUILD === '1') {
  console.log('[build-backend] HOST_SKIP_BACKEND_BUILD=1 — skipping');
  process.exit(0);
}

const root = path.resolve(__dirname, '..', '..');
const backendDir = path.join(root, 'backend');
const desktopDir = path.resolve(__dirname, '..');
const resourcesDir = path.join(desktopDir, 'resources');

const exeName = process.platform === 'win32' ? 'backend-runner.exe' : 'backend-runner';
const builtExe = path.join(backendDir, 'dist', exeName);
const stagedExe = path.join(resourcesDir, exeName);

function probePython(cmd, prefix) {
  // shell:false is critical — with shell:true on Windows, cmd.exe drops the
  // quotes around the -c argument and Python sees a broken script.
  const result = spawnSync(cmd, [...prefix, '-c', 'import sys;print(sys.version)'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.error) return null;
  if (result.status !== 0) return null;
  const stdout = (result.stdout || '').toString();
  const stderr = (result.stderr || '').toString();
  if (!stdout.trim()) return null;
  const blob = (stdout + stderr).toLowerCase();
  if (blob.includes('microsoft store') || blob.includes('was not found')) return null;
  return stdout.trim();
}

function detectPython() {
  if (process.env.HOST_PYTHON) {
    const out = probePython(process.env.HOST_PYTHON, []);
    if (out) {
      console.log(`[build-backend] using HOST_PYTHON=${process.env.HOST_PYTHON} (${out.split('\n')[0]})`);
      return [process.env.HOST_PYTHON];
    }
    throw new Error(`HOST_PYTHON=${process.env.HOST_PYTHON} did not produce a working Python.`);
  }

  const isWin = process.platform === 'win32';
  const candidates = isWin
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]];

  for (const [cmd, prefix] of candidates) {
    const out = probePython(cmd, prefix);
    if (out) {
      console.log(`[build-backend] using ${cmd} ${prefix.join(' ')} (${out.split('\n')[0]})`);
      return [cmd, ...prefix];
    }
  }

  throw new Error(
    'Could not find a working Python interpreter. Tried: py -3, python, python3. ' +
      'Install Python 3.11+ or set HOST_PYTHON to an absolute path (e.g. ' +
      'HOST_PYTHON="C:\\Users\\HP\\AppData\\Local\\Programs\\Python\\Python312\\python.exe").'
  );
}

const PY = detectPython();

function run(cmd, args, cwd) {
  console.log(`[build-backend] ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${result.status}`);
  }
}

function runPython(args, cwd) {
  run(PY[0], [...PY.slice(1), ...args], cwd);
}

function ensurePyinstaller() {
  const result = spawnSync(PY[0], [...PY.slice(1), '-c', 'import PyInstaller'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.status === 0) return;
  console.log('[build-backend] installing PyInstaller');
  runPython(['-m', 'pip', 'install', '--quiet', 'pyinstaller>=6.15'], backendDir);
}

function ensureBackendDeps() {
  const result = spawnSync(
    PY[0],
    [...PY.slice(1), '-c', 'import uvicorn, fastapi, jwt, slowapi, httpx'],
    { stdio: ['ignore', 'pipe', 'pipe'], shell: false }
  );
  if (result.status === 0) return;
  console.log('[build-backend] installing backend requirements');
  runPython(['-m', 'pip', 'install', '--quiet', '-r', 'requirements.txt'], backendDir);
}

function clean() {
  for (const dir of ['build', 'dist']) {
    const p = path.join(backendDir, dir);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  }
}

ensurePyinstaller();
ensureBackendDeps();
clean();
runPython(['-m', 'PyInstaller', 'backend.spec', '--noconfirm'], backendDir);

if (!fs.existsSync(builtExe)) {
  throw new Error(`backend exe not found at ${builtExe}`);
}

fs.mkdirSync(resourcesDir, { recursive: true });
fs.copyFileSync(builtExe, stagedExe);
console.log(`[build-backend] staged ${stagedExe}`);
