// Preflight for `npm run dist` / `npm run pack`.
//
// The packaging chain is long (PyInstaller -> next build -> electron-builder)
// and its failures surface late and cryptically — several minutes in, after
// pip has already installed things. Worse, some of them look like nothing
// happened at all. This checks the toolchain up front and says plainly whether
// a build can succeed here, and if not, what to do instead.
//
//   npm run doctor        # standalone
// Also runs automatically as the first step of predist/prepack.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const desktopDir = path.resolve(__dirname, '..');
const root = path.resolve(desktopDir, '..');
// --portable checks the cross-buildable target: a Windows zip containing only
// Electron + the app, pointed at a hosted server. It needs no Python and no
// Windows host, because nothing has to be compiled or signed.
const portable = process.argv.includes('--portable');
const skipBackend = portable || process.env.HOST_SKIP_BACKEND_BUILD === '1';
const skipFrontend = portable || process.env.HOST_SKIP_FRONTEND_BUILD === '1';

let failures = 0;
let warnings = 0;

const ok = (m, d) => console.log(`  [ ok ] ${m}${d ? `  — ${d}` : ''}`);
const warn = (m, d) => { warnings++; console.log(`  [warn] ${m}${d ? `\n         ${d}` : ''}`); };
const fail = (m, d) => { failures++; console.log(`  [FAIL] ${m}${d ? `\n         ${d}` : ''}`); };

// Returns trimmed stdout, or null if the command could not run / exited non-zero.
// Callers must ask for something that prints — an empty-but-successful run is
// indistinguishable from failure otherwise.
function sh(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  if (r.error || r.status !== 0) return null;
  return ((r.stdout || '') + '').trim();
}

const PROBE = 'import sys;print(sys.executable or "python")';

console.log('\nZenta desktop — build environment check\n');

// ---------------------------------------------------------------- platform --
console.log('Platform');
const plat = process.platform;
const targets = ((require('../package.json').build || {}).win || {}).target || [];
ok(`${plat} ${process.arch}`, `node ${process.version}`);

if (portable) {
  ok('portable Windows zip', 'cross-buildable from any OS — nothing is compiled or signed');
} else if (plat !== 'win32') {
  fail(
    `Cannot build the NSIS installer on ${plat}.`,
    'The installer bundles a backend built by PyInstaller, which only emits a\n' +
    '         Windows .exe when run on Windows, and NSIS signing needs Windows or wine.\n' +
    '         Two options:\n' +
    '           • run this on the Windows host (repo checked out on the Windows side)\n' +
    '           • build the portable zip instead:  npm run dist:portable\n' +
    '             (thin client — talks to your hosted server, no Python needed)'
  );
}

// ------------------------------------------------------------------ python --
console.log('\nBundled backend (PyInstaller)');
if (skipBackend) {
  ok('skipped', portable
    ? 'portable build — the app talks to your hosted server'
    : 'HOST_SKIP_BACKEND_BUILD=1 — the app will use a remote backend');
} else {
  const candidates = plat === 'win32'
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python3', []], ['python', []]];
  const envPy = process.env.HOST_PYTHON;
  let py = null;

  if (envPy) {
    if (sh(envPy, ['-c', PROBE])) py = [envPy];
    else fail(`HOST_PYTHON=${envPy} is not a working interpreter.`);
  } else {
    for (const [cmd, prefix] of candidates) {
      if (sh(cmd, [...prefix, '-c', PROBE])) { py = [cmd, ...prefix]; break; }
    }
  }

  if (!py) {
    fail(
      'No Python interpreter found.',
      'Install Python 3.11+ from python.org (tick "Add to PATH"), or set\n' +
      '         HOST_PYTHON to an absolute path. Or skip the bundled backend\n' +
      '         entirely — see "Thin client" below.'
    );
  } else {
    const ver = sh(py[0], [...py.slice(1), '-c', 'import sys;print(".".join(map(str,sys.version_info[:3])))']);
    ok(`python found: ${py.join(' ')}`, ver);

    // PyInstaller needs libpython. Distro/pyenv builds often lack it, and the
    // resulting error arrives only after pip has installed everything.
    if (plat !== 'win32') {
      const shared = sh(py[0], [...py.slice(1), '-c',
        "import sysconfig;print(sysconfig.get_config_var('Py_ENABLE_SHARED'))"]);
      if (shared === '0' || shared === 'None') {
        fail(
          'This Python was built without a shared library (Py_ENABLE_SHARED=0).',
          'PyInstaller cannot use it. Irrelevant once you build on Windows,\n' +
          '         which is required anyway.'
        );
      }
    }
  }
}

// ---------------------------------------------------------------- frontend --
console.log('\nBundled frontend (next build)');
if (skipFrontend) {
  ok('skipped', portable ? 'portable build — UI is loaded from the server' : 'HOST_SKIP_FRONTEND_BUILD=1');
} else {
  const feDir = path.join(root, 'frontend');
  if (!fs.existsSync(path.join(feDir, 'package.json'))) {
    fail(`frontend/ not found at ${feDir}`, 'Build from a full checkout of the repo.');
  } else if (!fs.existsSync(path.join(feDir, 'node_modules'))) {
    warn('frontend/node_modules missing.', 'Run `npm install` in ../frontend first, or the build will fail.');
  } else {
    ok('frontend/ ready');
  }
}

// ------------------------------------------------------------ node modules --
console.log('\nDesktop dependencies');
for (const dep of ['electron', 'electron-builder']) {
  if (fs.existsSync(path.join(desktopDir, 'node_modules', dep))) ok(dep);
  else fail(`${dep} not installed.`, 'Run `npm install` in desktop/ first.');
}

// ----------------------------------------------------------------- verdict --
console.log('');
if (failures === 0) {
  console.log(`Ready to build. ${warnings} warning(s).`);
  console.log(portable
    ? 'Target: zip -> desktop/dist/Zenta-Portable-Windows.zip\n'
    : `Target: ${targets.join(', ') || 'nsis'} -> desktop/dist/Zenta-Setup.exe\n`);
  process.exit(0);
}

console.log(`${failures} blocker(s), ${warnings} warning(s). A build will NOT succeed here.\n`);
console.log('Thin client (no Python, no bundled backend)');
console.log('  If the app should talk to your hosted server instead of running its own');
console.log('  backend, skip that whole step — still Windows-only for the installer:');
console.log('    HOST_SKIP_BACKEND_BUILD=1 npm run dist');
console.log('');
console.log('Not building at all?');
console.log('  Screen sharing and viewing work in the browser with nothing installed.');
console.log('  The desktop app is only needed to grant real mouse/keyboard control.\n');
process.exit(1);
