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


@dataclass
class _Lease:
    session_sub: str
    expires_at: float
    revoked: bool = False


_leases: dict[str, _Lease] = {}


def _gc() -> None:
    now = time.time()
    stale = [code for code, e in _entries.items() if e.expires_at < now or e.consumed]
    for code in stale:
        _entries.pop(code, None)
    stale_leases = [lease_id for lease_id, lease in _leases.items() if lease.expires_at < now or lease.revoked]
    for lease_id in stale_leases:
        _leases.pop(lease_id, None)


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


def issue_pair_lease(session_sub: str) -> tuple[str, int]:
    """Issue a temporary lease used to authorize one remote-control connection."""
    with _lock:
        _gc()
        lease_id = secrets.token_urlsafe(24)
        _leases[lease_id] = _Lease(
            session_sub=session_sub,
            expires_at=time.time() + _TTL_SECONDS,
        )
        return lease_id, _TTL_SECONDS


def validate_pair_lease(session_sub: str, lease_id: str | None) -> bool:
    if not lease_id:
        return False
    with _lock:
        _gc()
        lease = _leases.get(lease_id)
        if not lease or lease.revoked or lease.expires_at < time.time():
            return False
        return lease.session_sub == session_sub


def revoke_pair_lease(lease_id: str | None) -> None:
    if not lease_id:
        return
    with _lock:
        _gc()
        lease = _leases.get(lease_id)
        if lease:
            lease.revoked = True
