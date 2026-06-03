// Native input injection for consensual remote control.
//
// Runs ONLY in the Electron main process (the renderer/browser can never do
// this). Translates normalized control events from a viewer into real OS mouse
// and keyboard input via @nut-tree-fork/nut-js. Everything is wrapped so a
// malformed event can never crash the host app.

let nut = null;
let loadError = null;
try {
  nut = require('@nut-tree-fork/nut-js');
  // Make actions immediate (no artificial delays between steps).
  nut.mouse.config.autoDelayMs = 0;
  nut.keyboard.config.autoDelayMs = 0;
  if ('mouseSpeed' in nut.mouse.config) nut.mouse.config.mouseSpeed = 999999;
} catch (err) {
  loadError = err && err.message ? err.message : String(err);
}

function available() {
  return nut !== null;
}

function getLoadError() {
  return loadError;
}

function buttonFor(button) {
  if (!nut) return null;
  if (button === 2) return nut.Button.RIGHT;
  if (button === 1) return nut.Button.MIDDLE;
  return nut.Button.LEFT;
}

// Map a browser KeyboardEvent.key to a nut-js Key for non-character keys.
function specialKey(key) {
  if (!nut) return null;
  const K = nut.Key;
  const map = {
    Enter: K.Enter, Return: K.Return || K.Enter, Backspace: K.Backspace, Tab: K.Tab,
    Escape: K.Escape, Delete: K.Delete, Insert: K.Insert, ' ': K.Space, Spacebar: K.Space,
    ArrowUp: K.Up, ArrowDown: K.Down, ArrowLeft: K.Left, ArrowRight: K.Right,
    Home: K.Home, End: K.End, PageUp: K.PageUp, PageDown: K.PageDown,
    CapsLock: K.CapsLock,
    F1: K.F1, F2: K.F2, F3: K.F3, F4: K.F4, F5: K.F5, F6: K.F6,
    F7: K.F7, F8: K.F8, F9: K.F9, F10: K.F10, F11: K.F11, F12: K.F12,
  };
  return map[key] || null;
}

// Map a single printable character to a nut-js Key (used for modifier combos
// like Ctrl+C, where typing the raw string won't carry the modifier).
function charKey(ch) {
  if (!nut || !ch || ch.length !== 1) return null;
  const K = nut.Key;
  const upper = ch.toUpperCase();
  if (upper >= 'A' && upper <= 'Z') return K[upper];
  if (ch >= '0' && ch <= '9') return K['Num' + ch];
  return null;
}

function modifierKeys(event) {
  if (!nut) return [];
  const K = nut.Key;
  const mods = [];
  if (event.ctrl) mods.push(K.LeftControl);
  if (event.shift) mods.push(K.LeftShift);
  if (event.alt) mods.push(K.LeftAlt);
  if (event.meta) mods.push(K.LeftSuper);
  return mods;
}

// display: { x, y, width, height } in screen coordinates (from electron `screen`).
function toPoint(event, display) {
  const px = Math.round(display.x + Math.min(Math.max(event.x ?? 0, 0), 1) * display.width);
  const py = Math.round(display.y + Math.min(Math.max(event.y ?? 0, 0), 1) * display.height);
  return new nut.Point(px, py);
}

async function execute(event, display) {
  if (!nut || !event || typeof event !== 'object') return;
  try {
    switch (event.type) {
      case 'move':
        await nut.mouse.setPosition(toPoint(event, display));
        break;
      case 'down':
        await nut.mouse.setPosition(toPoint(event, display));
        await nut.mouse.pressButton(buttonFor(event.button));
        break;
      case 'up':
        await nut.mouse.setPosition(toPoint(event, display));
        await nut.mouse.releaseButton(buttonFor(event.button));
        break;
      case 'click':
        await nut.mouse.setPosition(toPoint(event, display));
        await nut.mouse.click(buttonFor(event.button));
        break;
      case 'dblclick':
        await nut.mouse.setPosition(toPoint(event, display));
        await nut.mouse.click(buttonFor(event.button));
        await nut.mouse.click(buttonFor(event.button));
        break;
      case 'wheel': {
        const dy = Math.round(event.dy || 0);
        if (dy > 0) await nut.mouse.scrollDown(Math.min(dy, 600));
        else if (dy < 0) await nut.mouse.scrollUp(Math.min(-dy, 600));
        break;
      }
      case 'key': {
        const key = event.key;
        if (!key || key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') break;
        const mods = modifierKeys(event);
        const special = specialKey(key);
        if (mods.length > 0) {
          const main = special || charKey(key);
          if (main) await nut.keyboard.type(...mods, main);
        } else if (special) {
          await nut.keyboard.type(special);
        } else if (key.length === 1) {
          await nut.keyboard.type(key);
        }
        break;
      }
      default:
        break;
    }
  } catch {
    // Never let a single event take down the host.
  }
}

module.exports = { available, getLoadError, execute };
