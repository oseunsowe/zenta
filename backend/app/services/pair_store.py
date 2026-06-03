import secrets
import threading
import time
from dataclasses import dataclass


@dataclass
class _Entry:
    session_sub: str
    expires_at: float
    issued_for_label: str | None
    consumed: bool = False


_lock = threading.Lock()
_entries: dict[str, _Entry] = {}
_TTL_SECONDS = 300  # 5 minutes


def _gc() -> None:
    now = time.time()
    stale = [code for code, e in _entries.items() if e.expires_at < now or e.consumed]
    for code in stale:
        _entries.pop(code, None)


def issue_pair_code(session_sub: str, label: str | None = None) -> tuple[str, int]:
    """Generate a 6-digit code bound to a session_sub. Returns (code, ttl_seconds)."""
    with _lock:
        _gc()
        # cryptographically random 6 digits, leading zeros preserved
        code = f'{secrets.randbelow(1_000_000):06d}'
        # avoid collision with an active code
        while code in _entries and not _entries[code].consumed:
            code = f'{secrets.randbelow(1_000_000):06d}'
        _entries[code] = _Entry(
            session_sub=session_sub,
            expires_at=time.time() + _TTL_SECONDS,
            issued_for_label=label,
        )
        return code, _TTL_SECONDS


def claim_pair_code(code: str) -> str | None:
    """Consume a code and return the session_sub it was bound to."""
    with _lock:
        _gc()
        entry = _entries.get(code)
        if not entry or entry.consumed or entry.expires_at < time.time():
            return None
        entry.consumed = True
        return entry.session_sub
