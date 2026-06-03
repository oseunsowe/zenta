import hashlib
import time
from typing import Iterable

import jwt

from app.config import settings
from app.services.admin_state import is_invite_only


def _hashed_invites() -> set[str]:
    raw = settings.invite_code_hashes or ''
    return {h.strip().lower() for h in raw.split(',') if h.strip()}


def _hash(code: str) -> str:
    return hashlib.sha256(code.strip().encode('utf-8')).hexdigest()


async def validate_invite_code(code: str) -> bool:
    if not is_invite_only():
        return True
    if not code:
        return False
    return _hash(code) in _hashed_invites()


def issue_session_token(code: str) -> str:
    return issue_session_token_for_sub(_hash(code)[:16])


def issue_session_token_for_sub(sub: str, scope: str = 'companion') -> str:
    now = int(time.time())
    payload = {
        'sub': sub,
        'iat': now,
        'exp': now + settings.jwt_ttl_seconds,
        'scope': scope,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_session_token(token: str | None) -> bool:
    return decode_session_token(token) is not None


def decode_session_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
