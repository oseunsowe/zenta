const { app, BrowserWindow, globalShortcut, ipcMain, screen, session, desktopCapturer, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const remoteInput = require('./remote-input');

// -----------------------------------------------------------------------------
// Zenta desktop client (consensual remote-support).
//
// Self-contained: in a packaged build it runs the bundled FastAPI backend
// (backend-runner.exe) and serves the Next.js UI from a bundled standalone
// server, then loads it. A transparent, visible window (taskbar entry, standard
// frame) — not a hidden overlay.
// -----------------------------------------------------------------------------

let mainWindow;
let backendProcess;
let frontendProcess;
let startupWarning = null;
let effectiveFrontendUrl = null;

const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production';
const FE_PORT = process.env.HOST_FE_PORT || '41733';
// The bundled backend uses a dedicated high port so it can never collide with a
// dev stack on :8000 (you can run both at once). Dev mode keeps :8000.
// NOTE: scripts/build-frontend.js bakes this same URL into the UI — keep in sync.
const BE_PORT = process.env.HOST_BE_PORT || (isPackaged ? '41800' : '8000');

// Server URL baked in at build time by electron-builder:
//   --config.extraMetadata.zenta.serverUrl=https://your-host
// A thin/portable build has no bundled backend or frontend, and an end user who
// double-clicks the exe has no environment variables set — so without this the
// window would point at a local port that nothing is listening on. Env vars
// still win, so a tester can retarget a build without rebuilding it.
function bakedServerUrl() {
  try {
    return ((require('./package.json') || {}).zenta || {}).serverUrl || '';
  } catch {
    return ''; // package.json unreadable — fall through to local defaults
  }
}

// A plain `server.txt` next to the executable overrides the baked URL. Quick
// tunnels hand out a new hostname every restart, so without this a portable
// build goes stale the moment the tunnel is recycled and has to be rebuilt and
// redistributed. Editing one line in the extracted folder is enough instead.
function serverUrlFromFile() {
  try {
    const dir = path.dirname(app.getPath('exe'));
    const raw = fs.readFileSync(path.join(dir, 'server.txt'), 'utf8');
    // Ignore blank lines and #-comments so the shipped file can explain itself.
    const line = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (!line) return '';
    return /^https?:\/\//i.test(line) ? line.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

const BAKED_SERVER_URL = serverUrlFromFile() || bakedServerUrl();

const BACKEND_URL =
  process.env.HOST_BACKEND_URL || BAKED_SERVER_URL || `http://127.0.0.1:${BE_PORT}`;
const FRONTEND_URL =
  process.env.HOST_FRONTEND_URL ||
  BAKED_SERVER_URL ||
  (isPackaged ? `http://127.0.0.1:${FE_PORT}` : 'http://127.0.0.1:3000');

// A baked URL implies remote mode: don't try to spawn a local backend.
const REMOTE_BACKEND = process.env.HOST_REMOTE_BACKEND === 'true' || Boolean(BAKED_SERVER_URL);
const HOST_DEBUG = process.env.HOST_DEBUG === 'true';

if (!effectiveFrontendUrl) {
  effectiveFrontendUrl = FRONTEND_URL;
}

// SHA-256 of DEMO-1 / DEMO-2 / DEMO-3 — lets a fresh install register/log in.
const DEMO_INVITE_HASHES = [
  '9d22d4c1a4a337cb387cd60185fe944e853f4bc9aa7de77ac4f7f6fa52551000',
  '18bbad029ac9d2fc6a4f773e0f0bc29d4628cc620506864a73ce0614d563bea6',
  '78608204f0c24e0606063a8bc6a493f4ff25cd0b87df7c893ce299479ed6aba4',
].join(',');

const SPLASH =
  'data:text/html,' +
  encodeURIComponent(
    '<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#07090f;color:#eef2fb;font-family:Segoe UI,sans-serif">' +
      '<div style="text-align:center"><div style="font-size:22px;font-weight:700;letter-spacing:-.02em">Zenta</div>' +
      '<div style="margin-top:10px;color:#9aa3c2;font-size:14px">Starting up…</div></div></body>'
  );

function debugLog(...args) {
  if (HOST_DEBUG) console.log(...args);
}
function debugErr(...args) {
  if (HOST_DEBUG) console.error(...args);
}

// --- Consensual remote control (native input injection) ------------------
let remoteControlEnabled = false;

// The display actually granted to getDisplayMedia() — NOT necessarily the
// primary one on a multi-monitor host. Set by setupScreenCapture() below;
// null falls back to primary (single-monitor hosts, or a window-capture
// source with no matching display).
let capturedDisplay = null;

// nut-js/libnut-win32 positions the cursor in PHYSICAL pixels (it explicitly
// patches DPI-scaling coordinate offsets — see its changelog), but Electron's
// `screen` module reports bounds in DIP/logical pixels. On any host running
// above 100% Windows scaling (125%/150%/200% are all common), mapping viewer
// coordinates onto the unscaled DIP bounds put every click's target inside a
// canvas smaller than the real screen — clicks drift further off the further
// they are from the top-left corner, and the cursor can never reach the
// bottom-right portion of the screen at all. Scale by scaleFactor to convert.
function toPhysicalDisplay(d) {
  const scale = d.scaleFactor || 1;
  return {
    x: Math.round(d.bounds.x * scale),
    y: Math.round(d.bounds.y * scale),
    width: Math.round(d.bounds.width * scale),
    height: Math.round(d.bounds.height * scale),
  };
}

function currentDisplay() {
  return capturedDisplay || toPhysicalDisplay(screen.getPrimaryDisplay());
}

ipcMain.on('remote-control-available', (event) => {
  event.returnValue = remoteInput.available();
});
ipcMain.on('remote-control-enabled', (_event, enabled) => {
  const next = !!enabled;
  // Disarming with keys still held would leave a modifier stuck down on this
  // machine — e.g. Ctrl held at the moment the viewer disconnects makes every
  // subsequent keystroke a shortcut. Always let go.
  if (remoteControlEnabled && !next) void remoteInput.releaseAll();
  remoteControlEnabled = next;
});
ipcMain.on('remote-input', (_event, controlEvent) => {
  if (!remoteControlEnabled) return;
  const display = currentDisplay();
  if (HOST_DEBUG && (controlEvent.type === 'down' || controlEvent.type === 'click')) {
    debugLog('[remote-input]', controlEvent.type,
      'norm=', controlEvent.x?.toFixed(4), controlEvent.y?.toFixed(4),
      'display=', display,
      'target_px=', Math.round(display.x + (controlEvent.x ?? 0) * display.width),
      Math.round(display.y + (controlEvent.y ?? 0) * display.height));
  }
  void remoteInput.execute(controlEvent, display);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false, // shown on 'ready-to-show' to avoid a white flash
    autoHideMenuBar: true,
    title: 'Zenta',
    backgroundColor: '#07090f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // --- Navigation lockdown (defense in depth) ---
  // Keep the window on the app's own origin; open any external link in the OS
  // browser instead of in-app; block new Electron windows entirely.
  let allowedOrigin = null;
  try {
    allowedOrigin = new URL(FRONTEND_URL).origin;
  } catch {
    /* leave null */
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('data:')) return; // the startup splash
    try {
      if (allowedOrigin && new URL(url).origin !== allowedOrigin) {
        event.preventDefault();
        if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(SPLASH);
}

// Resolve when something is listening at the given http URL (or time out).
function waitForServer(urlString, timeoutMs) {
  const parsed = new URL(urlString);
  const targetPort = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
  const hostname = parsed.hostname;
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const socket = net.connect({ host: hostname, port: targetPort });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) resolve(false);
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

function registerHotkey() {
  const hotkey = process.env.HOST_HOTKEY || 'CommandOrControl+Alt+Z';
  globalShortcut.register(hotkey, () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

// Persist a JWT secret so logins survive restarts of the bundled backend.
function persistedJwtSecret() {
  const p = path.join(app.getPath('userData'), 'jwt.secret');
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('base64url');
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(p, secret);
    } catch {
      /* fall back to ephemeral secret */
    }
    return secret;
  }
}

function spawnBackend() {
  if (REMOTE_BACKEND) {
    debugLog('[backend] remote mode — skipping local backend spawn');
    return null;
  }

  const exeName = process.platform === 'win32' ? 'backend-runner.exe' : 'backend-runner';
  const bundledExe = path.join(process.resourcesPath || '', exeName);

  const env = {
    ...process.env,
    BACKEND_HOST: process.env.BACKEND_HOST || '127.0.0.1',
    BACKEND_PORT: process.env.BACKEND_PORT || BE_PORT,
    BIND_MODE: process.env.BIND_MODE || 'loopback',
  };

  if (isPackaged) {
    if (!fs.existsSync(bundledExe)) {
      // Portable/thin builds may not include backend-runner.exe.
      startupWarning =
        'Local backend binary is missing (backend-runner.exe).\n\n' +
        'Run the app in remote mode by setting:\n' +
        'HOST_REMOTE_BACKEND=true\n' +
        'HOST_FRONTEND_URL=https://YOUR_SERVER\n' +
        'HOST_BACKEND_URL=https://YOUR_SERVER';
      debugErr('[backend] missing bundled backend executable:', bundledExe);
      return null;
    }
    // Self-contained config so the app works on a fresh machine.
    const userData = app.getPath('userData');
    env.CORS_ALLOW_ORIGINS = `http://127.0.0.1:${FE_PORT},http://localhost:${FE_PORT}`;
    env.INVITE_CODE_HASHES = process.env.INVITE_CODE_HASHES || DEMO_INVITE_HASHES;
    env.JWT_SECRET = process.env.JWT_SECRET || persistedJwtSecret();
    env.USERS_DB_PATH = path.join(userData, 'users.sqlite3');
    env.STATE_FILE = path.join(userData, 'runtime_state.json');
    env.MEMORY_SQLITE_PATH = path.join(userData, 'memory.sqlite3');
    return spawn(bundledExe, [], { cwd: userData, stdio: ['ignore', 'pipe', 'pipe'], env });
  }

  const args = ['-m', 'uvicorn', 'app.main:app', '--host', env.BACKEND_HOST, '--port', env.BACKEND_PORT, '--reload'];
  return spawn('python', args, {
    cwd: path.join(__dirname, '..', 'backend'),
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
}

function spawnFrontend() {
  if (isPackaged) {
    // Thin/portable build pointed at a hosted server: nothing to spawn, and
    // this is the intended configuration rather than a degraded one — so load
    // the remote URL directly and don't warn about a missing bundle.
    if (BAKED_SERVER_URL && !process.env.HOST_FRONTEND_URL) {
      effectiveFrontendUrl = FRONTEND_URL;
      debugLog('[fe] remote mode — loading', FRONTEND_URL);
      return null;
    }

    // Run the bundled Next.js standalone server using Electron's own Node.
    const serverDir = path.join(process.resourcesPath || '', 'frontend');
    const serverJs = path.join(serverDir, 'server.js');
    if (!fs.existsSync(serverJs)) {
      const fallback = process.env.HOST_FRONTEND_URL || BAKED_SERVER_URL;
      if (fallback) {
        effectiveFrontendUrl = fallback;
        startupWarning =
          'Bundled frontend is missing, falling back to remote mode.\n\n' +
          `Using ${fallback}`;
        debugErr('[fe] bundled frontend missing, using remote fallback:', fallback);
      } else {
        startupWarning =
          'Bundled frontend server.js is missing.\n\n' +
          'Set HOST_FRONTEND_URL to your deployed web app URL and relaunch.';
        debugErr('[fe] bundled frontend server.js missing at', serverJs);
      }
      return null;
    }
    effectiveFrontendUrl = FRONTEND_URL;
    return spawn(process.execPath, [serverJs], {
      cwd: serverDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        PORT: FE_PORT,
        HOSTNAME: '127.0.0.1',
        NEXT_PUBLIC_API_BASE_URL: BACKEND_URL,
      },
    });
  }

  return spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '..', 'frontend'),
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: '3000',
      NODE_ENV: 'development',
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || BACKEND_URL,
    },
  });
}

function startChildProcesses() {
  if (process.env.HOST_DISABLE_AUTO_START === 'true') return;

  frontendProcess = spawnFrontend();
  backendProcess = spawnBackend();

  if (frontendProcess) {
    frontendProcess.stdout.on('data', (d) => debugLog(`[fe] ${d}`));
    frontendProcess.stderr.on('data', (d) => debugErr(`[fe] ${d}`));
    frontendProcess.on('error', (err) => {
      debugErr('[fe] spawn error:', err && err.message ? err.message : err);
    });
  }
  if (backendProcess) {
    backendProcess.stdout.on('data', (d) => debugLog(`[be] ${d}`));
    backendProcess.stderr.on('data', (d) => debugErr(`[be] ${d}`));
    backendProcess.on('error', (err) => {
      debugErr('[be] spawn error:', err && err.message ? err.message : err);
      if (err && err.code === 'ENOENT') {
        dialog.showErrorBox(
          'Zenta startup warning',
          'Local backend binary not found.\n\n' +
            'Use remote mode:\n' +
            'HOST_REMOTE_BACKEND=true\n' +
            'HOST_FRONTEND_URL=https://YOUR_SERVER\n' +
            'HOST_BACKEND_URL=https://YOUR_SERVER'
        );
      }
    });
  }
}

function cleanup() {
  if (frontendProcess) frontendProcess.kill();
  if (backendProcess) backendProcess.kill();
}

function configureAutoLaunch() {
  const enabled = process.env.HOST_AUTOSTART === 'true';
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false });
}

// Electron needs an explicit getDisplayMedia() handler; grant the primary screen.
function setupScreenCapture() {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        const primary = sources.find((s) => s.id.startsWith('screen:')) || sources[0];
        // Record which actual Display this source is, so remote input maps
        // onto the screen that's really being shared — not always whatever
        // Electron considers "primary". desktopCapturer's `display_id` isn't
        // guaranteed present on every platform/source (e.g. window capture),
        // in which case currentDisplay() falls back to primary.
        const match = primary && primary.display_id
          ? screen.getAllDisplays().find((d) => String(d.id) === String(primary.display_id))
          : null;
        capturedDisplay = match ? toPhysicalDisplay(match) : null;
        if (HOST_DEBUG) {
          debugLog('[screen-capture] picked source:', primary && primary.id, primary && primary.name,
            'display_id=', primary && primary.display_id);
          debugLog('[screen-capture] all displays:', screen.getAllDisplays().map((d) => (
            { id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor }
          )));
          debugLog('[screen-capture] matched ->', match ? { bounds: match.bounds, scaleFactor: match.scaleFactor } : 'none (falls back to primary)',
            'capturedDisplay (physical px) =', capturedDisplay);
        }
        callback(primary ? { video: primary } : undefined);
      })
      .catch(() => callback(undefined));
  });
}

app.on('ready', async () => {
  debugLog('[remote] native input available:', remoteInput.available(), remoteInput.getLoadError() || '');
  setupScreenCapture();
  configureAutoLaunch();
  registerHotkey();
  startChildProcesses();
  createWindow();

  if (startupWarning) {
    dialog.showErrorBox('Zenta startup warning', startupWarning);
  }

  // Wait for the UI server (bundled standalone, dev server, or remote) before loading.
  const ready = await waitForServer(effectiveFrontendUrl, 45000);
  debugLog('[fe] server ready:', ready, effectiveFrontendUrl);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!ready) {
      startupWarning =
        (startupWarning ? `${startupWarning}\n\n` : '') +
        `Could not reach UI at ${effectiveFrontendUrl}.`;
    }
    // "/" is the public marketing page; the desktop app's home screen is the
    // accountless connect flow at "/connect".
    mainWindow.loadURL(`${effectiveFrontendUrl.replace(/\/$/, '')}/connect`);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => {
  app.isQuitting = true;
  cleanup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
