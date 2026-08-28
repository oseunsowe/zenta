#!/bin/sh
# Validate infra/.env before starting the stack.
#
# The backend runs with APP_ENV=production and deliberately refuses to boot on
# unsafe config. That is the right behaviour, but Docker only reports it as
# "container is unhealthy" / "dependency failed to start", which says nothing
# about the cause. Run this first and get a straight answer.
#
#   sh preflight.sh          # checks ./.env
#   sh preflight.sh path/to/.env

set -eu

ENV_FILE="${1:-.env}"
errors=0
warnings=0

err()  { printf '  [FAIL] %s\n' "$1"; errors=$((errors + 1)); }
warn() { printf '  [WARN] %s\n' "$1"; warnings=$((warnings + 1)); }
ok()   { printf '  [ ok ] %s\n' "$1"; }

if [ ! -f "$ENV_FILE" ]; then
    printf 'No %s found.\n\n  cp .env.example %s\n\nThen fill it in and re-run.\n' "$ENV_FILE" "$ENV_FILE"
    exit 1
fi

# Read a KEY=value from the env file, ignoring comments. Prints the raw value.
get() {
    sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | tr -d '\r'
}

printf 'Checking %s\n\n' "$ENV_FILE"

JWT=$(get JWT_SECRET)
if [ -z "$JWT" ]; then
    err "JWT_SECRET is empty. The backend will exit at startup.
         Generate one:  python3 -c \"import secrets;print(secrets.token_urlsafe(48))\""
elif [ "${#JWT}" -lt 32 ]; then
    err "JWT_SECRET is only ${#JWT} chars; 32 is the minimum. The backend will exit."
else
    ok "JWT_SECRET set (${#JWT} chars)"
fi

HASHES=$(get INVITE_CODE_HASHES)
ADMIN=$(get ADMIN_TOKEN)
INVITE_ONLY=$(get INVITE_ONLY)
if [ -z "$HASHES" ] && [ "$INVITE_ONLY" != "false" ]; then
    if [ -z "$ADMIN" ]; then
        err "INVITE_ONLY is on but INVITE_CODE_HASHES and ADMIN_TOKEN are both empty.
         Nobody could log in, so the backend will exit. Generate a hash:
         python3 -c \"import hashlib;print(hashlib.sha256(b'YOUR-CODE').hexdigest())\""
    else
        warn "INVITE_CODE_HASHES is empty — nobody can register or log in until you
         add one, or disable the gate via /admin."
    fi
else
    ok "INVITE_CODE_HASHES set"
fi

# A hash, not a raw code: 64 hex chars per entry.
if [ -n "$HASHES" ]; then
    for h in $(printf '%s' "$HASHES" | tr ',' ' '); do
        if ! printf '%s' "$h" | grep -qE '^[0-9a-fA-F]{64}$'; then
            err "INVITE_CODE_HASHES contains '$h', which is not a SHA-256 hex digest.
         This field takes the HASH of your invite code, not the code itself."
        fi
    done
fi

CORS=$(get CORS_ALLOW_ORIGINS)
case "$CORS" in
    "")            ok "CORS_ALLOW_ORIGINS empty (correct behind Caddy)" ;;
    *"*"*)         err "CORS_ALLOW_ORIGINS contains '*'. Unsafe with credentials; backend will exit." ;;
    *"127.0.0.1"*|*localhost*)
                   warn "CORS_ALLOW_ORIGINS points at localhost. Behind Caddy the UI is
         same-origin — leave this empty." ;;
    *)             warn "CORS_ALLOW_ORIGINS is set ($CORS). Leave empty unless the frontend
         is genuinely on another origin." ;;
esac

if [ -n "$ADMIN" ] && [ "${#ADMIN}" -lt 16 ]; then
    warn "ADMIN_TOKEN is short (${#ADMIN} chars); use 32+ or leave empty to disable /admin."
fi

printf '\n'
if [ "$errors" -gt 0 ]; then
    printf '%s error(s), %s warning(s) — the backend will NOT start. Fix the [FAIL] lines above.\n' "$errors" "$warnings"
    exit 1
fi
printf 'Ready to start. %s warning(s).\n' "$warnings"
