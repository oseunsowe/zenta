#!/usr/bin/env bash
# Bootstrap Zenta on a Google Cloud Always Free e2-micro instance (Ubuntu 22.04/24.04).
#
# Same shape as deploy-oracle.sh: brings the stack up behind a Cloudflare
# Tunnel, so nothing listens on a public port and no certificate needs
# managing. The difference from Oracle is NOT the compute — it's the network:
# GCP's Always Free tier caps egress at 1GB/month, and Zenta streams live
# screen video. See the warning this script prints before it does anything,
# and do not skip reading it.
#
# Run from the repo root on the instance:
#   sudo bash infra/deploy-gcp.sh
#
# Re-running is safe: it keeps existing secrets and rebuilds in place.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/infra/.env"
COMPOSE_FILE="$REPO_ROOT/infra/docker-compose.tunnel.yml"
COMPOSE=(docker compose -f "$COMPOSE_FILE")
SWAP_FILE="/swapfile"

REAL_USER="${SUDO_USER:-$USER}"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
warn() { printf '    \033[33m%s\033[0m\n' "$1"; }
die()  { printf '\n\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

[ -f "$COMPOSE_FILE" ] || die "Run this from the repo root: sudo bash infra/deploy-gcp.sh"

# ------------------------------------------------------------- egress warning
# This is the one thing about e2-micro that isn't a config problem you can
# script around: GCP's Always Free network allowance is 1GB/month, total,
# shared across every Always Free instance on the project. A single ~20-25
# minute Zenta screen-share session (~15fps JPEG over WebSocket) can use
# roughly that much on its own. Past 1GB you are billed per-GB — this script
# will not silently let that happen without you seeing this first.
say "Before anything else: read this"
warn "GCP Always Free egress is capped at 1GB/month, TOTAL, for the whole project."
warn "Zenta streams live screen video. One real support session can burn"
warn "close to that entire monthly allowance by itself. Past 1GB, GCP bills"
warn "you per-GB — there is no free-tier ceiling that stops it automatically."
info ""
info "This is fine for: testing this deploy script, occasional short sessions,"
info "keeping a billing budget alert armed so you find out immediately."
info "This is NOT fine for: daily-driver remote support usage — for that,"
info "Oracle Cloud's Always Free tier (10TB/month egress) is the right host."
info ""
info "Set a budget alert now, before continuing (needs the Cloud SDK locally,"
info "or use the Console: Billing -> Budgets & alerts -> Create budget):"
info "  gcloud billing budgets create --billing-account=YOUR_ACCOUNT_ID \\"
info "    --display-name='Zenta e2-micro' --budget-amount=1 \\"
info "    --threshold-rule=percent=50 --threshold-rule=percent=100"
read -r -p "    Have you read this, and still want to continue? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || exit 1

# ---------------------------------------------------------------- sanity ----
say "Checking the machine"
info "arch:   $(uname -m)"
info "kernel: $(uname -r)"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
info "memory: ${MEM_MB} MB"

# e2-micro ships with 1GB RAM, below what the Next.js build needs even on
# Oracle's larger AMD micro shape. Rather than warn and hope (Oracle script's
# approach, viable there because that shape has more headroom), provision
# swap outright — without it this build WILL be OOM-killed, not "might be."
SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$SWAP_MB" -lt 2000 ]; then
  say "Provisioning swap (${SWAP_MB}MB present, need headroom for the Next.js build)"
  if [ ! -f "$SWAP_FILE" ]; then
    fallocate -l 4G "$SWAP_FILE" || dd if=/dev/zero of="$SWAP_FILE" bs=1M count=4096
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE"
  fi
  swapon "$SWAP_FILE" 2>/dev/null || true
  grep -q "$SWAP_FILE" /etc/fstab || echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
  info "swap: $(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo) MB"
else
  info "swap: ${SWAP_MB} MB (already sufficient)"
fi

# ---------------------------------------------------------------- docker ----
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  say "Docker already installed"
  info "$(docker --version)"
else
  say "Installing Docker Engine + compose plugin"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  info "$(docker --version)"
fi

if [ "$REAL_USER" != "root" ]; then
  usermod -aG docker "$REAL_USER" || true
  info "added '$REAL_USER' to the docker group (re-login to use docker without sudo)"
fi

# --------------------------------------------------------------- secrets ----
say "Configuring secrets"
if [ -f "$ENV_FILE" ]; then
  info "infra/.env already exists — keeping current secrets"
else
  command -v python3 >/dev/null 2>&1 || apt-get install -y -qq python3
  INVITE_CODE="${ZENTA_INVITE_CODE:-zenta-$(python3 -c 'import secrets;print(secrets.token_hex(4))')}"
  python3 - "$REPO_ROOT" "$INVITE_CODE" <<'PY'
import hashlib, pathlib, re, secrets, sys
root, code = pathlib.Path(sys.argv[1]), sys.argv[2]
src = (root / 'infra' / '.env.example').read_text()
def setkv(t, k, v): return re.sub(rf'^{k}=.*$', f'{k}={v}', t, count=1, flags=re.M)
src = setkv(src, 'JWT_SECRET', secrets.token_urlsafe(48))
src = setkv(src, 'ADMIN_TOKEN', secrets.token_urlsafe(32))
src = setkv(src, 'INVITE_CODE_HASHES', hashlib.sha256(code.encode()).hexdigest())
(root / 'infra' / '.env').write_text(src)
PY
  chmod 600 "$ENV_FILE"
  info "generated JWT_SECRET, ADMIN_TOKEN and an invite code"
  printf '\n    \033[1mINVITE CODE: %s\033[0m\n' "$INVITE_CODE"
  info "(store this — it is the only way in, and only its hash is saved)"
fi

say "Validating configuration"
bash "$REPO_ROOT/infra/preflight.sh" "$ENV_FILE" || die "fix infra/.env and re-run"

# ----------------------------------------------------------------- build ----
say "Building and starting"
"${COMPOSE[@]}" up -d --build

say "Waiting for services to report healthy"
for i in $(seq 60); do
  unhealthy=$("${COMPOSE[@]}" ps --format '{{.Name}} {{.Status}}' \
    | grep -cE 'starting|unhealthy' || true)
  [ "$unhealthy" -eq 0 ] && break
  sleep 5
  [ "$i" -eq 60 ] && die "services did not become healthy — check: ${COMPOSE[*]} logs"
done
"${COMPOSE[@]}" ps --format '    {{.Name}}\t{{.Status}}'

# ------------------------------------------------------------------ url -----
say "Fetching the public URL"
URL=""
for _ in $(seq 30); do
  URL=$("${COMPOSE[@]}" logs cloudflared 2>&1 \
    | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)
  [ -n "$URL" ] && break
  sleep 3
done
[ -n "$URL" ] || die "no tunnel URL yet — check: ${COMPOSE[*]} logs cloudflared"

say "Smoke tests"
code_for() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }
printf '    %-34s %s (expect 200)\n' "GET  /login"    "$(code_for "$URL/login")"
printf '    %-34s %s (expect 200)\n' "GET  /download" "$(code_for "$URL/download")"
printf '    %-34s %s (expect 404)\n' "GET  /health"   "$(code_for "$URL/health")"
printf '    %-34s %s (expect 404)\n' "GET  /docs"     "$(code_for "$URL/docs")"
printf '    %-34s %s (expect 403)\n' "POST /auth/invite (bad code)" \
  "$(code_for -X POST "$URL/api/v1/auth/invite" -H 'Content-Type: application/json' -d '{"invite_code":"WRONG"}')"

cat <<EOF

$(printf '\033[1m')Zenta is live:  $URL$(printf '\033[0m')

  $(printf '\033[33m')Reminder: 1GB/month total egress on this tier. Check your usage before
  relying on this for real sessions:
    Console -> Billing -> Reports (filter: Network egress)$(printf '\033[0m')

  Open it on both computers, register an account on each with your invite code,
  then Share -> request -> accept -> view.

  This hostname lasts until the cloudflared container restarts. For one that
  never changes, add a domain to a free Cloudflare account and swap the
  cloudflared command in infra/docker-compose.tunnel.yml for a named tunnel:
      cloudflared tunnel login && cloudflared tunnel create zenta
      command: tunnel run --token <token>

  Useful commands:
    ${COMPOSE[*]} ps
    ${COMPOSE[*]} logs -f cloudflared
    ${COMPOSE[*]} down          # add -v to also delete accounts

EOF
