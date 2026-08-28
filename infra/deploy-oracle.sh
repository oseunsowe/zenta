#!/usr/bin/env bash
# Bootstrap Zenta on a fresh Oracle Cloud ARM instance (Ubuntu 22.04/24.04).
#
# Brings the stack up behind a Cloudflare Tunnel, so nothing listens on a public
# port: cloudflared makes an OUTBOUND connection and Cloudflare terminates TLS.
# That means no ingress rules, no iptables surgery, and no certificate to
# manage — while still giving the real HTTPS that getDisplayMedia requires.
#
# Run from the repo root on the instance:
#   sudo bash infra/deploy-oracle.sh
#
# Re-running is safe: it keeps existing secrets and rebuilds in place.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/infra/.env"
COMPOSE_FILE="$REPO_ROOT/infra/docker-compose.tunnel.yml"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

# Run docker as the invoking user, not root, once they are in the docker group.
REAL_USER="${SUDO_USER:-$USER}"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
die()  { printf '\n\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

[ -f "$COMPOSE_FILE" ] || die "Run this from the repo root: sudo bash infra/deploy-oracle.sh"

# ---------------------------------------------------------------- sanity ----
say "Checking the machine"
info "arch:   $(uname -m)   (aarch64 = Oracle Ampere ARM)"
info "kernel: $(uname -r)"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
info "memory: ${MEM_MB} MB"

# The Next.js build is the memory-hungry step. Oracle's 1 GB AMD micro shape
# will OOM part-way through and leave a confusing half-built image.
if [ "$MEM_MB" -lt 1800 ]; then
  info ""
  info "WARNING: under ~2 GB RAM. The frontend build may be killed by the OOM"
  info "killer. Add swap first, or use the Ampere A1 shape (4 OCPU / 24 GB)."
  info ""
  read -r -p "    Continue anyway? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || exit 1
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
  # dpkg arch resolves to arm64 on Ampere, amd64 on x86 — both are published.
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
say "Building and starting (first build takes a few minutes on ARM)"
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
