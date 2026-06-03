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
- The sharer must explicitly tick **"allow remote control"** on the share screen.
  The main process keeps its own consent flag (`remote-control-enabled`) and
  ignores all input unless it's on; control is revoked when the share screen
  unmounts.
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

```bash
cd desktop
npm install
npm run dist   # output in desktop/dist/
```

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
