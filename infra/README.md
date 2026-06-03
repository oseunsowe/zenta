# Deployment (VPS)

Production stack: FastAPI backend + Next.js frontend (standalone) behind Caddy,
which terminates TLS and serves **one origin** (`/api` → backend, everything
else → frontend). Both app services bind to `127.0.0.1` — only Caddy is public.

## Files

- `docker-compose.prod.yml` — backend + frontend, bound to loopback, secrets from `infra/.env`.
- `Caddyfile.public.example` — public reverse proxy with automatic HTTPS + security headers.
- `Caddyfile.example` — internal/CIDR-restricted variant (private staging only).

## Bring-up

```bash
# 1. Secrets — never commit infra/.env (it's gitignored)
cp ../backend/.env.example .env

# 2. Fill in REAL values in .env. At minimum:
#    JWT_SECRET   -> python -c "import secrets;print(secrets.token_urlsafe(48))"
#    ADMIN_TOKEN  -> python -c "import secrets;print(secrets.token_urlsafe(32))"
#    INVITE_CODE_HASHES -> sha256 of each invite code (see .env.example)
#    LLM_API_KEY  -> if using a real LLM provider
#    CORS_ALLOW_ORIGINS -> leave EMPTY (same-origin behind Caddy; no CORS needed)

# 3. Build + run
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# 4. Reverse proxy
cp Caddyfile.public.example Caddyfile      # edit the domain
caddy run --config Caddyfile               # or run as a service
```

## Security checklist before going live

- [ ] **JWT_SECRET set** (strong, random). Without it tokens break across workers and reset on restart.
- [ ] **ADMIN_TOKEN set** (or left empty to fully disable `/admin/*`).
- [ ] **Strong invite codes** — `INVITE_CODE_HASHES` are SHA-256 of your codes; use long random codes, not `DEMO-1`.
- [ ] **CORS_ALLOW_ORIGINS empty** in prod (Caddy makes it same-origin; no browser CORS).
- [ ] **App services bound to 127.0.0.1** (compose already does this) — never expose `:8000`/`:3000` publicly.
- [ ] **Firewall**: allow only 80/443 inbound; block 8000/3000 from the internet.
- [ ] **TLS** via Caddy (valid cert) — required for screen capture to work in browsers.
- [ ] `infra/.env`, databases, and `/private/` are **gitignored** (verify with `git status`).
- [ ] Rotate any secret that has ever been shared in chat/screenshots/logs.
- [ ] Back up the `backend_state` volume (it holds the user DB).

## Smoke tests after deploy

```bash
curl -s https://YOUR_DOMAIN/                       # 204 (root) or the app
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_DOMAIN/docs       # 404 (docs disabled)
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR_DOMAIN/health     # 404 from outside allowed CIDRs
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://YOUR_DOMAIN/api/v1/auth/invite \
  -H 'Content-Type: application/json' -d '{"invite_code":"WRONG"}'      # 403, then 429 after 5 tries
```

## Desktop app → this server (thin client)

Ship the desktop build with `HOST_FRONTEND_URL=https://YOUR_DOMAIN` and
`HOST_REMOTE_BACKEND=true` so it uses the hosted backend instead of bundling its
own. Then web (Chrome) and desktop users share the same accounts and sessions.
