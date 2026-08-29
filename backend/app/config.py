import secrets
from pydantic import field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = 'Echoface API'
    api_prefix: str = '/api/v1'
    # 'development' (default) or 'production'. Production enables fail-fast
    # startup checks in main.py instead of log warnings.
    app_env: str = 'development'
    invite_only: bool = True
    backend_host: str = '127.0.0.1'
    backend_port: int = 8000

    # Comma-separated SHA-256 hex digests of accepted invite codes.
    # Generate with: python -c "import hashlib;print(hashlib.sha256(b'YOUR-CODE').hexdigest())"
    invite_code_hashes: str = ''

    # JWT settings for issued session tokens.
    jwt_secret: str = secrets.token_urlsafe(48)
    jwt_algorithm: str = 'HS256'
    jwt_ttl_seconds: int = 60 * 60 * 8

    # Brute-force protection on /auth/invite.
    invite_rate_limit: str = '5/minute'

    # Admin token for runtime control endpoints. Empty disables admin endpoints.
    # Generate with: python -c "import secrets;print(secrets.token_urlsafe(32))"
    admin_token: str = ''

    # Path to a JSON file holding runtime-mutable state (admin toggles).
    state_file: str = 'runtime_state.json'

    # LLM provider: 'echo' (no network), 'groq'
    llm_provider: str = 'echo'
    llm_api_key: str = ''
    llm_model: str = 'llama-3.1-8b-instant'
    llm_base_url: str = 'https://api.groq.com/openai/v1'
    llm_timeout_seconds: float = 15.0

    # Memory backend: 'null' (no recall) or 'sqlite'
    memory_backend: str = 'null'
    memory_sqlite_path: str = 'memory.sqlite3'
    memory_window: int = 10

    # UltraViewer-style device connect: a machine claims a permanent numeric ID
    # and shows a rotating password, with no account and no invite code. This
    # deliberately bypasses INVITE_ONLY, so set it to false on a deployment that
    # must stay invite-gated.
    device_access_enabled: bool = True
    devices_db_path: str = 'devices.sqlite3'
    # Connect attempts per IP. Per-device lockout is separate and additive.
    device_connect_rate_limit: str = '10/minute'

    # User accounts (SQLite).
    users_db_path: str = 'users.sqlite3'
    # If true, /auth/register requires a valid invite code in the body.
    require_invite_for_register: bool = True
    # Share requests TTL in seconds.
    share_request_ttl: int = 300

    # Bind mode for pairing: 'loopback' (default, stealth) or 'lan' (phone control).
    # 'lan' overrides backend_host to 0.0.0.0 — only use when CIDR firewall or
    # tunnel limits access. Logs a warning on startup.
    bind_mode: str = 'loopback'

    # Outbound webhook: every chat reply is POSTed here (along with the user
    # message). Empty disables.
    webhook_out_url: str = ''
    webhook_out_token: str = ''

    # Inbound bridge token. POST /api/v1/bridge/inbound requires this in
    # X-Bridge-Token. Empty disables the endpoint entirely (404).
    bridge_inbound_token: str = ''

    # Comma-separated allowed origins for CORS. Empty = no browser origins allowed.
    cors_allow_origins: str = ''

    # Comma-separated CIDR ranges allowed to hit /health (loopback by default).
    health_allowed_cidrs: str = '127.0.0.0/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'

    # WebRTC ICE servers for /rtc/ice-servers. STUN is always offered; TURN is
    # only included when a shared secret is configured (coturn --use-auth-secret
    # ephemeral credentials — see app/services/turn.py). Empty turn_shared_secret
    # means dev/localhost STUN-only, which is fine since host candidates connect
    # directly with no NAT to traverse.
    stun_urls: str = 'stun:stun.l.google.com:19302'
    turn_urls: str = ''
    turn_shared_secret: str = ''
    turn_credential_ttl_seconds: int = 600

    @field_validator('jwt_secret')
    @classmethod
    def _reject_empty_jwt_secret(cls, value: str) -> str:
        """`JWT_SECRET=` (present but empty) must never reach PyJWT.

        pydantic-settings assigns the empty string rather than falling back to
        the generated default, and PyJWT will happily sign HS256 with an empty
        key — so anyone could forge a token for any sub/scope. Fall back to an
        ephemeral random secret; main.py hard-fails on this in production.
        """
        return value.strip() or secrets.token_urlsafe(48)

    class Config:
        env_file = '.env'
        env_file_encoding = 'utf-8'

settings = Settings()
