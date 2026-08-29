// electron-builder afterPack hook: the app has no i18n — every string in its
// UI is hardcoded English — so Chromium's 55 bundled locale files only cover
// native OS-level bits (right-click "Cut/Copy/Paste", spellcheck) that fall
// back to en-US anyway. Stripping to just that one saves ~33MB per build.
const fs = require('fs');
const path = require('path');

const KEEP = new Set(['en-US.pak']);

module.exports = async function afterPack(context) {
  const localesDir = path.join(context.appOutDir, 'locales');
  if (!fs.existsSync(localesDir)) return;

  let removed = 0;
  for (const file of fs.readdirSync(localesDir)) {
    if (KEEP.has(file)) continue;
    fs.rmSync(path.join(localesDir, file));
    removed += 1;
  }
  console.log(`[after-pack] stripped ${removed} unused locale file(s), kept: ${[...KEEP].join(', ')}`);
};
