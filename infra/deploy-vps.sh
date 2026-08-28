#!/usr/bin/env bash
# Bootstrap Zenta on a plain VPS you already own, behind Caddy with a real
# domain (Let's Encrypt automatic HTTPS) — for when you have your own box and
# DNS, unlike deploy-oracle.sh/deploy-gcp.sh which target a specific free tier
# and use a Cloudflare Tunnel instead of opening ports.
#
# Point your domain's A record at this VPS's IP BEFORE running this — Let's
# Encrypt needs to reach this server at the domain to issue a certificate.
#
# Run from the repo root on the VPS:
#   sudo ZENTA_DOMAIN=yourdomain.com bash infra/deploy-vps.sh
#
# Re-running is safe: it keeps existing secrets and rebuilds in place.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/infra/.env"
COMPOSE_FILE="$REPO_ROOT/infra/docker-compose.prod.yml"
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
CADDYFILE="/etc/caddy/Caddyfile"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
die()  { printf '\n\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

[ -f "$COMPOSE_FILE" ] || die "Run this from the repo root: sudo bash infra/deploy-vps.sh"

DOMAIN="${ZENTA_DOMAIN:-}"
if [ -z "$DOMAIN" ]; then
  read -r -p "Domain to serve Zenta on (must already point at this server's IP): " DOMAIN
fi
[ -n "$DOMAIN" ] || die "No domain given. Re-run with ZENTA_DOMAIN=yourdomain.com"

say "Checking DNS"
SERVER_IP=$(curl -s --max-time 8 https://api.ipify.org || true)
DOMAIN_IP=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)
info "this server:  ${SERVER_IP:-unknown}"
info "$DOMAIN resolves to: ${DOMAIN_IP:-<nothing yet>}"
if [ -n "$SERVER_IP" ] && [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  info ""
  info "WARNING: DNS for $DOMAIN doesn't point here yet (or hasn't propagated)."
  info "Let's Encrypt will fail to issue a certificate until it does."
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
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  info "$(docker --version)"
fi

# ----------------------------------------------------------------- caddy ----
if command -v caddy >/dev/null 2>&1; then
  say "Caddy already installed"
  info "$(caddy version)"
else
  say "Installing Caddy"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
  info "$(caddy version)"
fi

# --------------------------------------------------------------- secrets ----
say "Configuring secrets"
if [ -f "$ENV_FILE" ]; then
  info "infra/.env already exists — keeping current secrets"
else
  command -v python3 >/dev/null 2>&1 || apt-get install -y -qq python3
  INVITE_CODE="${ZENTA_INVITE_CODE:-zenta-$(python3 -c 'import secrets;print(secrets.token_hex(4))')}"
  python3 - "$REPO_ROOT" "$INVITE_CODE" "$DOMAIN" <<'PY'
import hashlib, pathlib, re, secrets, sys
root, code, domain = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
src = (root / 'infra' / '.env.example').read_text()
def setkv(t, k, v): return re.sub(rf'^{k}=.*$', f'{k}={v}', t, count=1, flags=re.M)
src = setkv(src, 'JWT_SECRET', secrets.token_urlsafe(48))
src = setkv(src, 'ADMIN_TOKEN', secrets.token_urlsafe(32))
src = setkv(src, 'INVITE_CODE_HASHES', hashlib.sha256(code.encode()).hexdigest())
src = setkv(src, 'NEXT_PUBLIC_SITE_URL', f'https://{domain}')
(root / 'infra' / '.env').write_text(src)
PY
  chmod 600 "$ENV_FILE"
  info "generated JWT_SECRET, ADMIN_TOKEN and an invite code"
  printf '\n    \033[1mINVITE CODE: %s\033[0m\n' "$INVITE_CODE"
  info "(store this — it is the only way in, and only its hash is saved)"
fi

say "Validating configuration"
bash "$REPO_ROOT/infra/preflight.sh" "$ENV_FILE" || die "fix infra/.env and re-run"

# ------------------------------------------------------------------ caddy ---
say "Writing Caddyfile for $DOMAIN"
sed "s/zenta\.example\.com/$DOMAIN/" "$REPO_ROOT/infra/Caddyfile.public.example" > "$CADDYFILE"
mkdir -p /srv/downloads
systemctl enable caddy >/dev/null 2>&1 || true

# ----------------------------------------------------------------- build ----
say "Building and starting the app (backend + frontend)"
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

say "Starting Caddy (this is where Let's Encrypt issues the certificate)"
systemctl restart caddy
sleep 2
systemctl is-active --quiet caddy && info "caddy: active" || die "caddy failed to start — check: journalctl -u caddy -n 40"

# ------------------------------------------------------------------ url -----
say "Smoke tests"
code_for() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }
URL="https://$DOMAIN"
printf '    %-34s %s (expect 200)\n' "GET  /"          "$(code_for "$URL/")"
printf '    %-34s %s (expect 200)\n' "GET  /download"  "$(code_for "$URL/download")"
printf '    %-34s %s (expect 404)\n' "GET  /health"    "$(code_for "$URL/health")"
printf '    %-34s %s (expect 404)\n' "GET  /docs"      "$(code_for "$URL/docs")"
printf '    %-34s %s (expect 403)\n' "POST /auth/invite (bad code)" \
  "$(code_for -X POST "$URL/api/v1/auth/invite" -H 'Content-Type: application/json' -d '{"invite_code":"WRONG"}')"

cat <<EOF

$(printf '\033[1m')Zenta is live:  $URL$(printf '\033[0m')

  If the smoke tests above show connection errors instead of status codes,
  the certificate is probably still being issued — check:
    journalctl -u caddy -n 40 --no-pager

  Useful commands:
    ${COMPOSE[*]} ps
    ${COMPOSE[*]} logs -f
    ${COMPOSE[*]} down          # add -v to also delete accounts
    systemctl status caddy
    journalctl -u caddy -f

EOF
