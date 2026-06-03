const nextConfig = {
  // App Router and SWC minification are defaults in Next 15; no flags needed.
  // 'standalone' emits a self-contained server (.next/standalone/server.js)
  // that the desktop app bundles and runs in-process. Harmless for web/dev.
  output: 'standalone',
};

export default nextConfig;
