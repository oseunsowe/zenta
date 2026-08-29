// Verifies the remote-control input translation without a desktop session.
//
// nut-js is replaced with a recorder, so we assert on the exact OS calls each
// viewer event produces. Run: node scripts/test-remote-input.js

const assert = require('assert');
const Module = require('module');

// ---- fake nut-js -----------------------------------------------------------
const calls = [];
const KeyNames = [
  'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
  'Num0','Num1','Num2','Num3','Num4','Num5','Num6','Num7','Num8','Num9',
  'NumPad0','NumPad1','NumPad2','NumPad3','NumPad4','NumPad5','NumPad6','NumPad7','NumPad8','NumPad9',
  'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  'Escape','Grave','Minus','Equal','Backspace','Tab','LeftBracket','RightBracket','Backslash',
  'CapsLock','Semicolon','Quote','Enter','Return','Comma','Period','Slash','Space',
  'Insert','Delete','Home','End','PageUp','PageDown','Up','Down','Left','Right',
  'Print','ScrollLock','Pause','Menu','NumLock','Divide','Multiply','Subtract','Add','Decimal',
  'LeftControl','RightControl','LeftShift','RightShift','LeftAlt','RightAlt','LeftSuper','RightSuper',
];
const Key = {};
KeyNames.forEach((n, i) => { Key[n] = i + 1; });
const nameOf = (v) => KeyNames[v - 1];

const fakeNut = {
  Key,
  Button: { LEFT: 'LEFT', RIGHT: 'RIGHT', MIDDLE: 'MIDDLE' },
  Point: class { constructor(x, y) { this.x = x; this.y = y; } },
  mouse: {
    config: {},
    setPosition: async (p) => calls.push(`move(${p.x},${p.y})`),
    pressButton: async (b) => calls.push(`pressButton(${b})`),
    releaseButton: async (b) => calls.push(`releaseButton(${b})`),
    click: async (b) => calls.push(`click(${b})`),
    doubleClick: async (b) => calls.push(`doubleClick(${b})`),
    scrollUp: async (n) => calls.push(`scrollUp(${n})`),
    scrollDown: async (n) => calls.push(`scrollDown(${n})`),
    scrollLeft: async (n) => calls.push(`scrollLeft(${n})`),
    scrollRight: async (n) => calls.push(`scrollRight(${n})`),
  },
  keyboard: {
    config: {},
    pressKey: async (k) => calls.push(`press(${nameOf(k)})`),
    releaseKey: async (k) => calls.push(`release(${nameOf(k)})`),
    type: async (...a) => calls.push(`type(${a.map(nameOf).join('+')})`),
  },
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === '@nut-tree-fork/nut-js') return '__fake_nut__';
  return origResolve.call(this, req, ...rest);
};
require.cache['__fake_nut__'] = { id: '__fake_nut__', filename: '__fake_nut__', loaded: true, exports: fakeNut };

const ri = require('../remote-input');

// ---- harness ---------------------------------------------------------------
const DISPLAY = { x: 0, y: 0, width: 1920, height: 1080 };
let failed = 0;

async function check(name, events, expected) {
  calls.length = 0;
  for (const e of Array.isArray(events) ? events : [events]) {
    await ri.execute(e, DISPLAY);
  }
  const got = calls.join(' ');
  const ok = got === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    console.log(`        got:      ${got}`);
    console.log(`        expected: ${expected}`);
  }
}

(async () => {
  console.log('\nRemote control — input translation\n');

  console.log('Mouse');
  await check('move maps 0..1 to screen pixels',
    { type: 'move', x: 0.5, y: 0.5 }, 'move(960,540)');
  await check('coords clamp to the display',
    { type: 'move', x: 5, y: -5 }, 'move(1920,0)');
  await check('right click', { type: 'click', x: 0, y: 0, button: 2 }, 'move(0,0) click(RIGHT)');
  await check('double click is one native double-click',
    { type: 'dblclick', x: 0, y: 0, button: 0 }, 'move(0,0) doubleClick(LEFT)');
  await check('drag = press, move, release', [
    { type: 'down', x: 0, y: 0, button: 0 },
    { type: 'move', x: 1, y: 1 },
    { type: 'up', x: 1, y: 1, button: 0 },
  ], 'move(0,0) pressButton(LEFT) move(1920,1080) move(1920,1080) releaseButton(LEFT)');

  console.log('\nScroll');
  await check('wheel down 3 notches', { type: 'wheel', x: 0, y: 0, dy: 3 }, 'move(0,0) scrollDown(3)');
  await check('wheel up', { type: 'wheel', x: 0, y: 0, dy: -2 }, 'move(0,0) scrollUp(2)');
  await check('horizontal scroll now works',
    { type: 'wheel', x: 0, y: 0, dy: 0, dx: 4 }, 'move(0,0) scrollRight(4)');
  await check('runaway delta is clamped',
    { type: 'wheel', x: 0, y: 0, dy: 99999 }, 'move(0,0) scrollDown(60)');

  console.log('\nKeyboard — held keys');
  await check('letter press/release',
    [{ type: 'keydown', code: 'KeyA', key: 'a' }, { type: 'keyup', code: 'KeyA', key: 'a' }],
    'press(A) release(A)');
  await check('modifier alone is held (was dropped before)',
    [{ type: 'keydown', code: 'ControlLeft', key: 'Control' }],
    'press(LeftControl)');
  await check('Ctrl+C as real chord', [
    { type: 'keydown', code: 'ControlLeft', key: 'Control' },
    { type: 'keydown', code: 'KeyC', key: 'c', ctrl: true },
    { type: 'keyup', code: 'KeyC', key: 'c', ctrl: true },
    { type: 'keyup', code: 'ControlLeft', key: 'Control' },
  ], 'press(LeftControl) press(C) release(C) release(LeftControl)');
  await check('Shift+drag keeps shift down while the mouse moves', [
    { type: 'keydown', code: 'ShiftLeft', key: 'Shift' },
    { type: 'down', x: 0, y: 0, button: 0 },
    { type: 'move', x: 0.5, y: 0.5 },
    { type: 'up', x: 0.5, y: 0.5, button: 0 },
  ], 'press(LeftShift) move(0,0) pressButton(LEFT) move(960,540) move(960,540) releaseButton(LEFT)');

  console.log('\nKeyboard — mapping by physical code');
  await check('Ctrl+/ (punctuation, previously unmappable)',
    { type: 'keydown', code: 'Slash', key: '/' }, 'press(Slash)');
  await check('Ctrl+Minus', { type: 'keydown', code: 'Minus', key: '-' }, 'press(Minus)');
  await check('shifted key uses physical code, not the shifted char',
    { type: 'keydown', code: 'Digit1', key: '!', shift: true }, 'press(Num1)');
  await check('numpad is distinct from the number row',
    { type: 'keydown', code: 'Numpad5', key: '5' }, 'press(NumPad5)');
  await check('F5', { type: 'keydown', code: 'F5', key: 'F5' }, 'press(F5)');
  await check('arrow key', { type: 'keydown', code: 'ArrowUp', key: 'ArrowUp' }, 'press(Up)');
  await check('right-hand modifier keeps its side',
    { type: 'keydown', code: 'AltRight', key: 'Alt' }, 'press(RightAlt)');
  await check('unmappable key is ignored, not crashed',
    { type: 'keydown', code: 'Bogus', key: 'Unidentified' }, '');

  console.log('\nStuck-key safety');
  calls.length = 0;
  await ri.execute({ type: 'keydown', code: 'ControlLeft', key: 'Control' }, DISPLAY);
  await ri.execute({ type: 'keydown', code: 'ShiftLeft', key: 'Shift' }, DISPLAY);
  calls.length = 0;
  await ri.releaseAll();
  const released = calls.join(' ');
  const ok = released.includes('release(LeftControl)') && released.includes('release(LeftShift)');
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  releaseAll() frees every held key  -> ${released}`);

  calls.length = 0;
  await ri.releaseAll();
  const twice = calls.length === 0;
  if (!twice) failed += 1;
  console.log(`${twice ? 'PASS' : 'FAIL'}  releaseAll() is idempotent`);

  await check('keyreset event releases held keys', [
    { type: 'keydown', code: 'KeyW', key: 'w' },
    { type: 'keyreset' },
  ], 'press(W) release(W)');

  console.log('\nBackwards compatibility');
  await check('legacy single-shot key with modifier',
    { type: 'key', code: 'KeyC', key: 'c', ctrl: true },
    'press(LeftControl) press(C) release(C) release(LeftControl)');
  await check('legacy plain key',
    { type: 'key', code: 'KeyA', key: 'a' }, 'press(A) release(A)');

  console.log('');
  console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})();
