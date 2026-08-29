const nextConfig = {
  // App Router and SWC minification are defaults in Next 15; no flags needed.
  // 'standalone' emits a self-contained server (.next/standalone/server.js)
  // that the desktop app bundles and runs in-process. Harmless for web/dev.
  output: 'standalone',
  // No page here renders next/image — only plain <img>/<video> — so the
  // built-in optimizer's `sharp` dependency is dead weight. `unoptimized`
  // only disables the optimizer at runtime; the standalone output tracer
  // still bundles `sharp` defensively regardless (the /_next/image route's
  // code path exists whether or not anything calls it), dragging in every
  // platform's native binary — ~32MB, including Linux ones that can't even
  // run on the Windows desktop build. outputFileTracingExcludes is what
  // actually keeps it out of the traced bundle.
  images: {
    unoptimized: true,
  },
  outputFileTracingExcludes: {
    '*': ['node_modules/@img/**', 'node_modules/sharp/**'],
  },
};

export default nextConfig;
