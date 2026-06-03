// Resolves the WebSocket base URL.
//
// Priority:
//   1. NEXT_PUBLIC_API_BASE_URL if set (explicit http/https -> ws/wss).
//   2. Same-origin as the page (works behind an HTTPS reverse proxy on any
//      host: localhost, LAN IP, tunnel domain). This is the path used when
//      the app is served through Apache/XAMPP on https://<host>:8443.
//   3. ws://127.0.0.1:8000 as a last resort for SSR / non-browser contexts.
export function wsBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  if (base.startsWith('https://')) return base.replace(/^https:/, 'wss:');
  if (base.startsWith('http://')) return base.replace(/^http:/, 'ws:');

  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }

  return 'ws://127.0.0.1:8000';
}
