# Zenta desktop client

A transparent desktop wrapper around the Zenta web UI for **consensual remote
support** — one person shares their screen and the other views/assists, with
both parties consenting in-app.

> This is intentionally a normal, visible application: standard window, taskbar
> entry, and discoverable/quittable. It is **not** a hidden or
> screen-capture-invisible overlay. Consensual support requires transparency,
> and visible behavior is also what payment processors and app stores require.

## Behavior

- Normal `BrowserWindow` (visible on launch, taskbar entry, standard frame).
- Renderer locked down for safety: `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`; devtools only in dev builds.
- In dev, auto-spawns the local frontend (`:3000`) and backend (`:8000`).
  The spawned frontend is pointed at the local backend via
  `NEXT_PUBLIC_API_BASE_URL`.
- Packaged builds load `HOST_FRONTEND_URL` (your deployed app) and run the
  bundled `backend-runner.exe`, or use a remote backend.
- Optional, opt-in launch-at-login (`HOST_AUTOSTART=true`) — shown normally,
  not hidden.
- Convenience global hotkey to focus the window (`Ctrl/Cmd+Alt+Z`).

## Remote control (consensual)

The desktop app can grant a viewer **real mouse/keyboard control** — the browser
cannot, so this only works when the person being controlled runs this app.

- Native input is performed in the main process via `@nut-tree-fork/nut-js`
  (`remote-input.js`); the renderer can only *request* it over the preload bridge.
- Control is **armed automatically** while the share screen is open in the
  desktop app (UltraViewer-style). The gate is the remote password, not a
  checkbox: only someone holding the current 6-digit password can join the
  session and send input.
- The main process still keeps its own consent flag (`remote-control-enabled`)
  and ignores all input unless it is on. Control is revoked when the share
  screen unmounts, and every key still held is released at that moment so a
  modifier cannot be left stuck down.
- The password rotates on demand, and regenerates automatically when a viewer
  connection drops, so a leaked password stops working after a disconnect.
- Screen capture is granted to the renderer via `setDisplayMediaRequestHandler`
  (whole primary screen), which the input coordinate mapping assumes.
- If the native module fails to load, control silently stays unavailable and the
  rest of the app is unaffected.

## Run (dev)

```bash
cd desktop
npm install
npm start
```

Requires Python + the backend deps for the auto-spawned backend, and the
frontend deps in `../frontend`. To load an already-running app instead of
spawning servers:

```bash
HOST_DISABLE_AUTO_START=true HOST_FRONTEND_URL=http://127.0.0.1:3000 npm start
```

## Package an installer

**Windows only.** The target is NSIS and `scripts/build-backend.js` runs
PyInstaller, which emits a Windows `.exe` only when run on Windows. A Linux
devcontainer or WSL shell cannot produce this build, and the repo has to be
checked out on the Windows side.

Check the toolchain before starting — it answers in under a second, instead of
failing several minutes into PyInstaller:

```bash
cd desktop
npm install
npm run doctor   # verifies platform, Python, frontend deps; exits 1 with fixes
npm run dist     # output in desktop/dist/Zenta-Setup.exe
```

`doctor` also runs automatically as the first step of `prepack`/`predist`, so a
build that cannot succeed stops immediately rather than part-way through.

### Portable Windows build — cross-buildable from Linux/macOS

A thin client that talks to your hosted server: no bundled backend, no bundled
frontend, so nothing has to be compiled and nothing has to be signed. This
**does** build from Linux (no Windows, no wine, no Python) in about 90 seconds.

```bash
npm install
npm run dist:portable   # -> desktop/dist/Zenta-Portable-Windows.zip (~120 MB)
```

Remote control still works: `@nut-tree-fork/libnut` ships prebuilt binaries for
every platform, and the Windows one is packaged and unpacked from the asar.

**Pointing it at a server.** The zip contains a `server.txt` next to `Zenta.exe`.
Whoever runs it can edit that one line and restart — no rebuild, no reinstall:

```
# Lines starting with # are ignored.
https://your-server.example.com
```

That matters because a Cloudflare quick tunnel hands out a new hostname on
every restart, which would otherwise strand every copy you had distributed.

Resolution order, first match wins:

1. `HOST_FRONTEND_URL` / `HOST_BACKEND_URL` environment variables
2. `server.txt` next to the executable
3. URL baked at build time:
   `--config.extraMetadata.zenta.serverUrl=https://your-server`
4. Local bundled servers (the full installer build)

To pre-fill it so the download works on first run, write the URL into
`extra/server.txt` before building — that file is copied next to the exe.

### What the portable build does *not* include

No bundled FastAPI backend and no bundled UI, so it is useless without a
reachable server. For a self-contained installer that runs its own backend, use
the NSIS build above — that one is genuinely Windows-only.

## Environment

| Var | Purpose | Default |
| --- | --- | --- |
| `HOST_FRONTEND_URL` | URL loaded in the window | `http://127.0.0.1:3000` |
| `HOST_BACKEND_URL` | Backend base URL (used for the spawned frontend's API base) | `http://127.0.0.1:8000` |
| `HOST_REMOTE_BACKEND` | `true` = don't spawn a local backend | unset |
| `HOST_DISABLE_AUTO_START` | Skip spawning local frontend/backend | unset |
| `HOST_AUTOSTART` | Register at OS login (visible) | unset |
| `HOST_HOTKEY` | Focus-window accelerator | `CommandOrControl+Alt+Z` |
| `HOST_DEBUG` | Print child-process stdout/stderr | unset |

## Notes

- For a standalone installer, the FastAPI backend is bundled as
  `resources/backend-runner.exe` (built via `npm run build:backend`,
  PyInstaller). Code-sign the installer before distributing to avoid
  SmartScreen/Gatekeeper warnings.
- When loading a production HTTPS URL, use a real certificate so no
  cert-bypass flags are needed.
