import base64
import hashlib
import hmac
import time

from app.config import settings


def generate_turn_credentials(label: str, ttl_seconds: int | None = None) -> dict | None:
    """Ephemeral TURN credentials, coturn `--use-auth-secret` convention.

    username = "<expiry_unix_ts>:<label>"
    credential = base64(HMAC-SHA1(shared_secret, username))

    coturn verifies the HMAC itself and rejects anything past its embedded
    expiry — nothing needs to be tracked server-side, unlike the JWT/pair-lease
    flows elsewhere in this file's siblings.
    """
    if not settings.turn_shared_secret:
        return None
    ttl = ttl_seconds if ttl_seconds is not None else settings.turn_credential_ttl_seconds
    expiry = int(time.time()) + ttl
    username = f'{expiry}:{label}'
    digest = hmac.new(
        settings.turn_shared_secret.encode('utf-8'),
        username.encode('utf-8'),
        hashlib.sha1,
    ).digest()
    return {
        'username': username,
        'credential': base64.b64encode(digest).decode('ascii'),
        'ttl': ttl,
    }
