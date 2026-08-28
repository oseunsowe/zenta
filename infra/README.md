# Deployment (VPS)

Production stack: FastAPI backend + Next.js frontend (standalone) behind Caddy,
which terminates TLS and serves **one origin** (`/api` → backend, everything
else → frontend). Both app services bind to `127.0.0.1` — only Caddy is public.

## Files

- `docker-compose.prod.yml` — backend + frontend, bound to loopback, secrets from `infra/.env`.
- `docker-compose.tunnel.yml` — full stack + Caddy + Cloudflare Tunnel, for testing across machines.
- `.env.example` — **production** environment template. Use this one, not `backend/.env.example`.
- `Caddyfile.public.example` — public reverse proxy with automatic HTTPS + security headers.
- `Caddyfile.tunnel` — proxy config used by `docker-compose.tunnel.yml` (plain HTTP; Cloudflare does TLS).
- `Caddyfile.example` — internal/CIDR-restricted variant (private staging only).

---

# Testing across two computers (Cloudflare Tunnel)

Runs everything on **one** machine and publishes it at a public HTTPS URL. No
VPS, no domain, no port forwarding, no Cloudflare account.

**HTTPS is mandatory, not cosmetic.** `SharePanel.tsx` calls
`navigator.mediaDevices.getDisplayMedia()`, which browsers block outside a
secure context. Screen sharing cannot work over a plain `http://<LAN-IP>`
address, which is why this uses a tunnel rather than exposing a LAN port.

```bash
cd infra
cp .env.example .env
```

Fill in `.env` — the backend runs with `APP_ENV=production` here, so it will
refuse to start without these:

```bash
# JWT_SECRET (>=32 chars, required)
python -c "import secrets;print(secrets.token_urlsafe(48))"

# INVITE_CODE_HASHES — sha256 of the code you'll type on both computers
python -c "import hashlib;print(hashlib.sha256(b'YOUR-TEST-CODE').hexdigest())"
```

Check the file before starting — this catches the mistakes that otherwise show
up as an unexplained container failure:

```bash
sh preflight.sh
```

Then bring it up and read the URL out of the logs:

```bash
docker compose -f docker-compose.tunnel.yml up -d --build
docker compose -f docker-compose.tunnel.yml logs -f cloudflared
# look for:  https://<random-words>.trycloudflare.com
```

### If the backend won't start

```
✗ Container infra-backend-1  Error
dependency failed to start: container infra-backend-1 is unhealthy
```

This almost always means `.env` is incomplete, **not** that something crashed.
The backend runs with `APP_ENV=production` and refuses to boot on config that
would be unsafe or unusable; Caddy and cloudflared then never start because
they wait on `backend: service_healthy`.

Docker does not surface the reason. Get it with:

```bash
sh preflight.sh                                              # fastest
docker compose -f docker-compose.tunnel.yml logs backend | tail -5   # exact error
```

The usual causes, all reported by name in the log's last line:

| Message | Fix |
| --- | --- |
| `JWT_SECRET is not set (or is empty)` | You copied `.env.example` but never filled it in. Generate a secret. |
| `JWT_SECRET is only N characters` | Needs 32+. |
| `INVITE_ONLY=true but INVITE_CODE_HASHES is empty and ADMIN_TOKEN is unset` | Add an invite hash, or set an admin token. |
| `CORS_ALLOW_ORIGINS contains "*"` | Leave it empty behind Caddy. |

`INVITE_CODE_HASHES` takes the **SHA-256 of** your invite code, not the code
itself — a raw code there fails login with no server error at all. `preflight.sh`
checks for this.

Open that URL on **both** computers and:

1. Register a separate account on each (both need `YOUR-TEST-CODE`).
2. On computer A, go to `/share` and create a share request for B's username.
3. On computer B, accept it under `/requests`.
4. A publishes its screen; B watches at `/view`.

Tear down with `docker compose -f docker-compose.tunnel.yml down`. Add `-v` to
also delete the accounts.

### The desktop app is optional

`/download` is a public page (no sign-in) explaining the desktop client and
serving its installer. Send testers `https://<your-host>/download`.

**Most testing does not need it.** Screen sharing and viewing are pure browser
APIs. The desktop app exists for one thing: granting the viewer real mouse and
keyboard control, which a browser cannot do. Only the person *being* controlled
needs to install it — the controller stays in their browser.

#### Publishing a build

Two builds are possible, and the page serves whichever exists (installer first,
then portable).

**Portable zip — builds anywhere, including this Linux devcontainer.** A thin
client with no bundled backend or UI, so nothing is compiled or signed. ~90s.

```bash
cd desktop && npm install
# Pre-fill the server URL so it works on first run (optional):
echo "https://YOUR_HOST" >> extra/server.txt
npm run dist:portable   # -> desktop/dist/Zenta-Portable-Windows.zip
cp desktop/dist/Zenta-Portable-Windows.zip infra/downloads/
```

The zip ships a `server.txt` next to `Zenta.exe`; editing that one line
retargets an already-distributed copy without a rebuild. That is what keeps
builds usable when a quick tunnel changes hostname.

**NSIS installer — Windows only.** Self-contained: bundles the FastAPI backend
via PyInstaller, which only emits a Windows `.exe` on Windows.

```powershell
# On the Windows host (not inside WSL). Needs Python + Node.
cd desktop
npm install
npm run doctor          # verifies the toolchain in under a second
npm run dist            # -> desktop\dist\Zenta-Setup.exe
```

Then drop it where Caddy can serve it:

```bash
# tunnel stack: infra/downloads/ is mounted into the caddy container
cp /path/to/Zenta-Setup.exe infra/downloads/

# VPS: Caddy runs on the host
scp Zenta-Setup.exe user@vps:/srv/downloads/Zenta-Setup.exe
```

No restart needed — Caddy serves it off disk immediately. The `/download` page
sends a `HEAD` request on load, so it flips from "No build published yet" to a
live download button on its own, and back again if you remove the file.

`desktop/package.json` pins `artifactName: Zenta-Setup.exe` so the built
filename already matches the path the page links to. Installers are gitignored
(`infra/downloads/*`); only `.gitkeep` is tracked.

Unsigned builds trigger a SmartScreen warning on first run. Code-sign before
distributing to anyone outside your test group.

### Notes and limits

- **The quick-tunnel hostname changes every restart.** Fine for a test session.
  For a stable URL, put a domain on Cloudflare, run `cloudflared tunnel login`
  and `cloudflared tunnel create zenta`, then swap the `cloudflared` command for
  `tunnel run --token <token>`. Same stack otherwise.
- **No host ports are published.** Every service is reached through `caddy` on
  the internal Docker network, and cloudflared connects *outbound*, so nothing
  is listening on your machine.
- **Anyone with the URL can reach the login page.** The invite gate and rate
  limiter are the only things in front of it — use a real random invite code,
  not `TEST-1`, and shut the tunnel down when you're finished.
- **Cloudflare sees your traffic in plaintext** at its edge; it terminates TLS.
  Fine for testing, worth knowing.

---

# Deploying to Oracle Cloud (free ARM tier)

Same tunnel stack, but on a box that stays up. Running it on a laptop or a
codespace means the hostname changes every time the machine sleeps; a VPS keeps
the tunnel alive, so the URL holds until you restart the container.

Because the tunnel connects **outbound**, no inbound port is ever opened. That
skips the single most common Oracle problem — their Ubuntu images ship
`iptables` REJECT rules that silently drop 80/443 even after you add the VCN
ingress rules, which sends people in circles for hours. Nothing to configure
here, and no TLS certificate to manage.

## 1. Create the instance

Oracle's Always Free tier includes **4 ARM (Ampere A1) cores and 24 GB RAM**,
which builds and runs this comfortably.

1. Sign up at <https://cloud.oracle.com>. A payment card is required for
   identity verification; Always Free resources are not charged.
2. **Compute → Instances → Create instance**
   - Image: **Ubuntu 24.04** (or 22.04)
   - Shape: **Ampere → VM.Standard.A1.Flex**, 4 OCPU / 24 GB
   - Save the SSH private key it offers — you cannot download it later.
3. Note the instance's **public IP**.

Do **not** pick the AMD `E2.1.Micro` shape. It has 1 GB of RAM and the Next.js
build gets OOM-killed part-way through, which looks like a random failure.

> `Out of capacity` on the ARM shape is common in busy regions. Retry (often
> succeeds within a day), choose a different availability domain, or switch the
> account to Pay As You Go — that improves ARM availability and Always Free
> resources stay free.

## 2. Deploy

SSH in, then:

```bash
ssh -i your-key.pem ubuntu@YOUR_PUBLIC_IP

sudo apt-get update && sudo apt-get install -y git
git clone YOUR_REPO_URL zenta && cd zenta

sudo bash infra/deploy-oracle.sh
```

The script installs Docker Engine and the compose plugin, generates
`JWT_SECRET`, `ADMIN_TOKEN` and an invite code, runs `preflight.sh`, builds and
starts the stack, waits for both services to report healthy, then prints the
public URL and runs the smoke tests.

It is idempotent: re-running keeps existing secrets and rebuilds in place. To
choose your own invite code, set `ZENTA_INVITE_CODE=... ` before running it.

Expect the first build to take several minutes — the frontend compiles natively
on ARM. Later builds are cached.

## 3. Keeping the URL stable

The quick-tunnel hostname survives reboots of your *laptop* but not restarts of
the `cloudflared` container. For a permanent address, add any domain to a free
Cloudflare account and switch to a named tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create zenta
# then in infra/docker-compose.tunnel.yml replace the cloudflared command with:
#   command: tunnel run --token <token>
```

Everything else stays the same. Alternatively, open 80/443 and use
`Caddyfile.public.example` for a direct Let's Encrypt setup — but then the
Oracle firewall notes above do apply, on **both** layers:

```bash
# VCN ingress rules alone are not enough; the instance firewall also blocks.
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

# Deploying to Google Cloud (Always Free e2-micro) — read the caveat first

Same tunnel-based stack as Oracle above, and `infra/deploy-gcp.sh` mirrors
`infra/deploy-oracle.sh` exactly for the Docker/secrets/build steps. Use this
**only** if Oracle's ARM capacity is unavailable in your region and you've
retried — Oracle is the better fit for this app and is documented above.

**Why this tier is different, and it's not the compute:** GCP's Always Free
network egress is capped at **1GB/month, total, project-wide** (vs. Oracle's
10TB/month). Zenta streams live screen video over WebSocket — roughly
40-80KB per JPEG frame at ~15fps, which works out to about **2.7GB/hour**
during an active session. A single 20-25 minute support session can burn the
entire monthly allowance by itself, and every byte past 1GB is billed per-GB
with no free-tier ceiling stopping it automatically.

Treat e2-micro as fine for **testing this deploy script or occasional short
sessions**, not for daily-driver remote support. `deploy-gcp.sh` will not let
you skip past this warning, and prints the `gcloud billing budgets create`
command to arm an alert before it does anything else.

The e2-micro shape (1 vCPU, 1GB RAM) is also below what the Next.js build
needs — unlike the Oracle script, which only warns, `deploy-gcp.sh`
provisions a 4GB swapfile automatically before building, since without it the
build **will** be OOM-killed, not just might be.

```bash
ssh -i your-key.pem YOUR_USER@YOUR_GCP_INSTANCE_IP
sudo apt-get update && sudo apt-get install -y git
git clone YOUR_REPO_URL zenta && cd zenta
sudo bash infra/deploy-gcp.sh
```

Create the instance in one of the Always Free-eligible regions
(`us-west1`, `us-central1`, or `us-east1`) with the `e2-micro` machine type,
Standard (not Premium) network tier, and 30GB standard persistent disk —
straying from any of these moves you off the free tier.

---

## Bring-up

```bash
# 1. Secrets — never commit infra/.env (it's gitignored)
#    Use THIS directory's template. backend/.env.example is a dev file: its
#    relative DB paths would bypass the backend_state volume and its loopback
#    CORS origin does not belong on a public deployment.
cp .env.example .env

# 2. Fill in REAL values in .env. At minimum:
#    JWT_SECRET   -> python -c "import secrets;print(secrets.token_urlsafe(48))"
#    ADMIN_TOKEN  -> python -c "import secrets;print(secrets.token_urlsafe(32))"
#    INVITE_CODE_HASHES -> sha256 of each invite code (see .env.example)
#    LLM_API_KEY  -> if using a real LLM provider
#    CORS_ALLOW_ORIGINS -> leave EMPTY (same-origin behind Caddy; no CORS needed)
#
#    The backend runs with APP_ENV=production and refuses to start on a missing,
#    empty, or under-32-character JWT_SECRET rather than silently issuing
#    forgeable tokens. Database paths are pinned by compose — do not set them.

# 3. Build + run
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# 4. Confirm both containers report healthy before exposing them
docker compose -f docker-compose.prod.yml ps

# 5. Reverse proxy
cp Caddyfile.public.example Caddyfile      # edit the domain
caddy run --config Caddyfile               # or run as a service
```

## Verifying state actually persists

The single most costly misconfiguration is the databases landing in the
container layer instead of the volume, which wipes every account on redeploy.
Check it once, on the real deployment:

```bash
docker compose -f docker-compose.prod.yml exec backend ls -l /app/state
# must list users.sqlite3 (after the first registration) and runtime_state.json

docker compose -f docker-compose.prod.yml exec backend printenv USERS_DB_PATH
# must print /app/state/users.sqlite3 — a bare users.sqlite3 means data loss
```

## Security checklist before going live

- [ ] **JWT_SECRET set** (strong, random, ≥32 chars). Enforced at startup under `APP_ENV=production`.
- [ ] **State paths verified** — `printenv USERS_DB_PATH` inside the container returns `/app/state/...` (see above).
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
  -H 'Content-Type: application/json' -d '{"invite_code":"WRONG"}'      # 403 x5, then 429
```

## The backend must run as a single process

`backend/Dockerfile` pins `--workers 1`. This is a correctness requirement, not
a tuning knob:

- `app/services/screen_relay.py` keeps live `WebSocket` objects in a per-process
  dict. A publisher and a viewer accepted by *different* workers never see each
  other, so the viewer receives no frames.
- `app/services/pair_store.py` (pair codes) and `slowapi`'s rate-limit counters
  are per-process too.

The failure mode is nasty: it only appears between two separate machines, it is
intermittent, and nothing logs an error — the stream just stays blank. Measured
on this stack, `--workers 2` delivered 7/8 frames; `--workers 1` delivered 14/14.

Do not raise the worker count, add a second backend replica, or put the backend
behind a load balancer until the relay has a shared backplane (Redis pub/sub or
similar). The workload is I/O-bound, so one asyncio process handles many
concurrent sessions fine.

### X-Forwarded-For trust

Per-IP rate limiting and the `/health` CIDR gate depend on
`--forwarded-allow-ips=*` in `backend/Dockerfile`. That is safe **only** while
port 8000 is published on `127.0.0.1` and firewalled, so Caddy is the only
client. If you ever expose the backend port directly, remove the wildcard —
otherwise anyone can spoof `X-Forwarded-For` and bypass both.

## Desktop app → this server (thin client)

Ship the desktop build with `HOST_FRONTEND_URL=https://YOUR_DOMAIN` and
`HOST_REMOTE_BACKEND=true` so it uses the hosted backend instead of bundling its
own. Then web (Chrome) and desktop users share the same accounts and sessions.
