// Builds the Next.js frontend in "standalone" mode and stages the self-contained
// server into desktop/resources/frontend, so the packaged app can serve its own
// UI with no external dev server. Run by the predist/prepack hooks.
// Skip with HOST_SKIP_FRONTEND_BUILD=1.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.env.HOST_SKIP_FRONTEND_BUILD === '1') {
  console.log('[build-frontend] HOST_SKIP_FRONTEND_BUILD=1 — skipping');
  process.exit(0);
}

const desktopDir = path.resolve(__dirname, '..');
const root = path.resolve(desktopDir, '..');
const frontendDir = path.join(root, 'frontend');
const stageDir = path.join(desktopDir, 'resources', 'frontend');

// The packaged UI talks to the bundled backend on its dedicated port (41800),
// so it never collides with a dev stack on :8000. Baked at build time.
// NOTE: must match BE_PORT in desktop/main.js.
console.log('[build-frontend] next build (standalone)');
const build = spawnSync('npm', ['run', 'build'], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:41800',
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_ENV: 'production',
  },
});
if (build.status !== 0) {
  throw new Error(`next build exited ${build.status}`);
}

const standalone = path.join(frontendDir, '.next', 'standalone');
if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  throw new Error('standalone/server.js not found — is output:"standalone" set in next.config.mjs?');
}

console.log('[build-frontend] staging ->', stageDir);
fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });

// Standalone bundle (server.js + traced node_modules + server chunks).
fs.cpSync(standalone, stageDir, { recursive: true });
// Static assets and public/ are NOT included in standalone — copy them in.
fs.cpSync(path.join(frontendDir, '.next', 'static'), path.join(stageDir, '.next', 'static'), { recursive: true });
const publicDir = path.join(frontendDir, 'public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(stageDir, 'public'), { recursive: true });
}

console.log('[build-frontend] done');
