# Remote deployment

Three patterns to get the backend reachable from a second machine without breaking stealth.

## A. Tailscale (recommended for personal use)

Tailscale gives every device a private `100.x.x.x` IP that only your tailnet can reach. No port forwarding, no public DNS, no certs needed.

1. Install Tailscale on the backend host and the client device.
2. `tailscale up` on both. Note the backend's tailnet IP.
3. On the backend host:
   ```env
   BIND_MODE=lan
   CORS_ALLOW_ORIGINS=http://<tailnet-ip>:3000
   HEALTH_ALLOWED_CIDRS=100.64.0.0/10
   ```
4. On the client device, point the desktop runner at the tailnet:
   ```env
   HOST_REMOTE_BACKEND=true
   HOST_BACKEND_URL=http://<tailnet-ip>:8000
   HOST_FRONTEND_URL=http://<tailnet-ip>:3000
   ```

Done. The backend is reachable only over the tailnet. No public exposure.

## B. Cloudflare Tunnel (recommended for invited users)

1. Install `cloudflared` on the backend host.
2. `cloudflared tunnel login`, create a tunnel: `cloudflared tunnel create stealth`.
3. Route a hostname (e.g. `stealth.internal.you.dev`) to `http://127.0.0.1:8000`.
4. Add Cloudflare Access policies: only specific Google/GitHub identities can reach the hostname.
5. Backend stays on `BIND_MODE=loopback` — the tunnel is the only ingress.
6. Clients use the public hostname:
   ```env
   HOST_REMOTE_BACKEND=true
   HOST_BACKEND_URL=https://stealth.internal.you.dev
   ```

The backend stays loopback-only on the host machine — Cloudflare terminates TLS and enforces auth before traffic reaches your network.

## C. Direct hosted backend

Run the backend on a VPS, lock the frontend to talk to it, and protect the public surface with the existing stealth controls (invite hashes + rate limits + admin-token-gated CORS).

1. Deploy with `infra/docker-compose.prod.yml` behind Caddy
   (`infra/Caddyfile.public.example` for a public domain; `infra/Caddyfile.example`
   only for a CIDR-restricted internal host). Start from `infra/.env.example`.
2. Set in the deployed env:
   ```env
   APP_ENV=production        # enables fail-fast startup checks
   BIND_MODE=loopback        # Caddy is the only ingress
   CORS_ALLOW_ORIGINS=       # empty: Caddy serves UI + API on one origin
   HEALTH_ALLOWED_CIDRS=127.0.0.0/8,::1/128,172.16.0.0/12   # container healthcheck only
   ```
   Leave `HEALTH_ALLOWED_CIDRS` non-empty — the compose healthcheck calls the
   backend from inside the Docker network, and `/health` still 404s publicly
   because Caddy never proxies it.
3. Caddy listens on 443 and terminates TLS. The app ports stay on loopback.

## Picking between them

| If you... | Use |
| --- | --- |
| Just want phone-controls-desktop on the same WiFi | LAN mode + pairing, no tunnel |
| Need cross-network access for yourself + a few teammates | Tailscale |
| Need cross-network access for invited testers without giving them a tailnet | Cloudflare Tunnel |
| Need a shared backend for many users | Hosted VPS + Caddy with CIDR allowlist |

## Desktop runner behavior

`HOST_REMOTE_BACKEND=true` makes the desktop runner skip the local `backend-runner.exe` spawn entirely. The Electron window then loads `HOST_FRONTEND_URL` (which can be a hosted Next.js URL) and that page hits `HOST_BACKEND_URL` for the API.
