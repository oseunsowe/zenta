// Native input injection for consensual remote control.
//
// Runs ONLY in the Electron main process (the renderer/browser can never do
// this). Translates normalized control events from a viewer into real OS mouse
// and keyboard input via @nut-tree-fork/nut-js. Everything is wrapped so a
// malformed event can never crash the host app.
//
// Keys use press/release rather than "type", so holding a key on the viewer
// holds it on the host: Shift+drag, Ctrl+click, arrow-key repeat and
// click-and-drag all behave like a local keyboard. Every key we press is
// tracked so releaseAll() can clear a stuck modifier if the viewer disconnects
// mid-chord.

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

// The screen size nut-js/libnut itself reports — hardware/physical pixels,
// exactly the coordinate space mouse.setPosition() places the cursor in.
// Only covers the *main* display (nut-js has no multi-monitor API here), but
// for that display this is ground truth: it comes straight from the library
// that will actually move the cursor, instead of being derived from
// Electron's DIP bounds * scaleFactor and hoping the conversion is right.
async function nativeScreenSize() {
  if (!nut) return null;
  try {
    return { width: await nut.screen.width(), height: await nut.screen.height() };
  } catch {
    return null;
  }
}

function buttonFor(button) {
  if (!nut) return null;
  if (button === 2) return nut.Button.RIGHT;
  if (button === 1) return nut.Button.MIDDLE;
  return nut.Button.LEFT;
}

// KeyboardEvent.code -> nut-js Key name. `code` is the physical key, so it is
// correct regardless of modifiers or layout shifting: Ctrl+Shift+'/' still
// reports code "Slash", whereas `key` would report "?" and fail to map.
const CODE_TO_KEY = {
  Escape: 'Escape', Backquote: 'Grave', Minus: 'Minus', Equal: 'Equal',
  Backspace: 'Backspace', Tab: 'Tab', BracketLeft: 'LeftBracket',
  BracketRight: 'RightBracket', Backslash: 'Backslash', CapsLock: 'CapsLock',
  Semicolon: 'Semicolon', Quote: 'Quote', Enter: 'Enter', Comma: 'Comma',
  Period: 'Period', Slash: 'Slash', Space: 'Space',
  Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  PrintScreen: 'Print', ScrollLock: 'ScrollLock', Pause: 'Pause',
  ContextMenu: 'Menu', NumLock: 'NumLock',
  NumpadDivide: 'Divide', NumpadMultiply: 'Multiply',
  NumpadSubtract: 'Subtract', NumpadAdd: 'Add', NumpadDecimal: 'Decimal',
  NumpadEnter: 'Enter',
  ControlLeft: 'LeftControl', ControlRight: 'RightControl',
  ShiftLeft: 'LeftShift', ShiftRight: 'RightShift',
  AltLeft: 'LeftAlt', AltRight: 'RightAlt',
  MetaLeft: 'LeftSuper', MetaRight: 'RightSuper',
};
for (let i = 0; i <= 9; i += 1) {
  CODE_TO_KEY[`Digit${i}`] = `Num${i}`;
  CODE_TO_KEY[`Numpad${i}`] = `NumPad${i}`;
}
for (let c = 65; c <= 90; c += 1) {
  CODE_TO_KEY[`Key${String.fromCharCode(c)}`] = String.fromCharCode(c);
}
for (let i = 1; i <= 12; i += 1) {
  CODE_TO_KEY[`F${i}`] = `F${i}`;
}

// Fallback for senders that only provide `key` (older clients, quick actions).
const KEY_TO_KEY = {
  Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape',
  Delete: 'Delete', Insert: 'Insert', ' ': 'Space', Spacebar: 'Space',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  CapsLock: 'CapsLock', Control: 'LeftControl', Shift: 'LeftShift',
  Alt: 'LeftAlt', Meta: 'LeftSuper',
};

// Resolve an event to a nut-js Key value, or null when unmappable.
function resolveKey(event) {
  if (!nut) return null;
  const K = nut.Key;

  const byCode = event.code && CODE_TO_KEY[event.code];
  if (byCode && K[byCode] !== undefined) return K[byCode];

  const key = event.key;
  if (!key) return null;

  const byName = KEY_TO_KEY[key];
  if (byName && K[byName] !== undefined) return K[byName];

  if (/^F([1-9]|1[0-2])$/.test(key) && K[key] !== undefined) return K[key];

  // Single printable character with no usable code (e.g. synthetic events).
  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') return K[upper];
    if (key >= '0' && key <= '9') return K[`Num${key}`];
  }
  return null;
}

// Keys currently held down by the remote viewer, so we can always let go.
const held = new Set();

async function pressKey(k) {
  await nut.keyboard.pressKey(k);
  held.add(k);
}

async function releaseKey(k) {
  held.delete(k);
  await nut.keyboard.releaseKey(k);
}

// Release everything the viewer left pressed. Called when control is disarmed
// or the session ends — otherwise a modifier held at disconnect stays down on
// the host machine and makes it unusable.
async function releaseAll() {
  if (!nut) return;
  const stuck = Array.from(held);
  held.clear();
  for (const k of stuck) {
    try {
      await nut.keyboard.releaseKey(k);
    } catch {
      /* best effort */
    }
  }
}

// display: { x, y, width, height } in screen coordinates (from electron `screen`).
function toPoint(event, display) {
  const px = Math.round(display.x + Math.min(Math.max(event.x ?? 0, 0), 1) * display.width);
  const py = Math.round(display.y + Math.min(Math.max(event.y ?? 0, 0), 1) * display.height);
  return new nut.Point(px, py);
}

// Wheel deltas arrive already normalized to notches by the sender, batched
// over ~50ms of real scrolling (see ViewPanel's scheduleWheel) rather than
// one message per raw event — so a legitimate fast fling can add up to more
// than a single tick's worth. Clamp higher than one tick would ever need, but
// still bounded so a runaway value can't spin the host's scroll indefinitely.
function notches(value) {
  const n = Math.round(value || 0);
  if (!n) return 0;
  return Math.max(-60, Math.min(60, n));
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
        await nut.mouse.doubleClick(buttonFor(event.button));
        break;
      case 'wheel': {
        // Windows delivers wheel input to the window under the cursor, so the
        // pointer has to be where the viewer is pointing before we scroll —
        // otherwise the scroll lands on whatever was last hovered.
        await nut.mouse.setPosition(toPoint(event, display));
        const dy = notches(event.dy);
        const dx = notches(event.dx);
        if (dy > 0) await nut.mouse.scrollDown(dy);
        else if (dy < 0) await nut.mouse.scrollUp(-dy);
        if (dx > 0) await nut.mouse.scrollRight(dx);
        else if (dx < 0) await nut.mouse.scrollLeft(-dx);
        break;
      }
      case 'keydown': {
        const k = resolveKey(event);
        if (k !== null) await pressKey(k);
        break;
      }
      case 'keyup': {
        const k = resolveKey(event);
        if (k !== null) await releaseKey(k);
        break;
      }
      case 'keyreset':
        await releaseAll();
        break;
      // Legacy single-shot key event: press and release with modifiers held
      // around it. Kept so older viewers and the quick-action buttons work.
      case 'key': {
        const key = event.key;
        if (!key || key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') break;
        const K = nut.Key;
        const mods = [];
        if (event.ctrl) mods.push(K.LeftControl);
        if (event.shift) mods.push(K.LeftShift);
        if (event.alt) mods.push(K.LeftAlt);
        if (event.meta) mods.push(K.LeftSuper);
        const main = resolveKey(event);
        if (main === null) break;
        for (const m of mods) await pressKey(m);
        await pressKey(main);
        await releaseKey(main);
        for (const m of mods.reverse()) await releaseKey(m);
        break;
      }
      default:
        break;
    }
  } catch {
    // Never let a single event take down the host.
  }
}

module.exports = { available, getLoadError, execute, releaseAll, resolveKey, notches, nativeScreenSize };
