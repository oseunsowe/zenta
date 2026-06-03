# Browser extension

A Chromium extension (Chrome, Edge, Brave, Arc) that surfaces the companion without installing the desktop app. Lives in [extension/](../extension/).

## What it gives you

- **Toolbar icon** opens a small popup with quick-launch buttons.
- **Side panel** (Chrome 114+) docks the full companion frontend on the right.
- **Hotkey** `Ctrl+Shift+Z` (`Cmd+Shift+Z` on Mac) toggles the side panel.
- **"Open as window"** spawns a frameless popup window — closest thing to the Electron desktop runner, with no taskbar entry on Windows.
- **Options page** sets the backend URL (defaults to `http://127.0.0.1:3000`).

The extension does **not** rewrite the UI. It wraps the existing Next.js frontend in an iframe / popup, so every feature (login, chat, pair, view, share) works without duplication.

## Install (unpacked, dev)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** → select [extension/](../extension/)
4. The Workspace Helper icon appears in the toolbar — click it
5. If the side panel says "Backend URL not set", click **change** → set it (e.g. `http://127.0.0.1:3000`)

## Install (packaged, internal distribution)

1. `chrome://extensions` → toggle Developer mode
2. **Pack extension** → root: `c:\xampp\htdocs\Zenta\extension` → leave private key empty
3. A `.crx` and `.pem` are produced; share the `.crx` with testers
4. They drag-drop it onto `chrome://extensions` to install

For a published listing in the Chrome Web Store you need a developer account ($5 one-time) and a signed submission — out of scope here.

## Stealth properties this gives you

| Property | Extension | Electron desktop |
| --- | --- | --- |
| No installer trace | ✅ | ❌ (NSIS leaves registry entries) |
| No tray icon | ✅ | ✅ |
| No taskbar entry | ✅ when using side panel; ❌ when using "Open as window" with a popup window | ✅ |
| Hidden from screen capture | **❌ — no browser API for this** | ✅ via `setContentProtection(true)` |
| Process hidden in Task Manager | ✅ (runs inside Chrome) | ❌ (separate `Workspace Helper.exe`) |
| Survives Chrome update | ✅ | n/a |
| No admin needed to install | ✅ | ✅ |

**The headline trade-off:** the extension cannot hide from screen capture. If somebody screenshots your monitor while the side panel is open, it will appear. The Electron desktop runner remains the only way to get screen-capture invisibility on Windows. Ship both — extension for casual/quick use, desktop runner when capture-stealth matters.

## Configuration

| Setting | Where |
| --- | --- |
| Backend URL | Options page (right-click icon → Options) |
| Hotkey | `chrome://extensions/shortcuts` |
| Icon visibility | Right-click icon → "Hide in Chrome menu" (still keyboard-toggleable) |

## How it relates to the existing frontend

The extension *is* the existing [frontend/](../frontend/) app, rendered inside a Chrome surface. URLs work the same:

- side panel src → `${backendUrl}/`
- "Open as window" → `chrome.windows.create({ url: ${backendUrl}, type: 'popup' })`
- Popup links → `${backendUrl}/view`, `${backendUrl}/pair`

So changes to the Next.js UI automatically flow to the extension.
