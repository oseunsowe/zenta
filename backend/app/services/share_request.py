import secrets
import threading
import time
from dataclasses import dataclass

from app.config import settings


STATUS_PENDING = 'pending'
STATUS_ACCEPTED = 'accepted'
STATUS_DECLINED = 'declined'
STATUS_EXPIRED = 'expired'


@dataclass
class ShareRequest:
    id: int
    from_user_id: int
    to_user_id: int
    note: str | None
    status: str
    session_id: str | None
    created_at: float
    expires_at: float


_lock = threading.Lock()
_requests: dict[int, ShareRequest] = {}
_next_id = 1


def _gc() -> None:
    now = time.time()
    for req in list(_requests.values()):
        if req.status == STATUS_PENDING and req.expires_at < now:
            req.status = STATUS_EXPIRED
        # Drop terminal requests older than 1 hour.
        if req.status != STATUS_PENDING and (now - req.expires_at) > 3600:
            _requests.pop(req.id, None)


def create(from_user_id: int, to_user_id: int, note: str | None) -> ShareRequest:
    global _next_id
    if from_user_id == to_user_id:
        raise ValueError('cannot request from yourself')
    with _lock:
        _gc()
        now = time.time()
        req = ShareRequest(
            id=_next_id,
            from_user_id=from_user_id,
            to_user_id=to_user_id,
            note=note,
            status=STATUS_PENDING,
            session_id=None,
            created_at=now,
            expires_at=now + settings.share_request_ttl,
        )
        _next_id += 1
        _requests[req.id] = req
        return req


def respond(request_id: int, responder_user_id: int, accept: bool) -> ShareRequest:
    with _lock:
        _gc()
        req = _requests.get(request_id)
        if req is None:
            raise KeyError('not found')
        if req.to_user_id != responder_user_id:
            raise PermissionError('not yours to respond')
        if req.status != STATUS_PENDING:
            raise ValueError(f'already {req.status}')
        if accept:
            req.status = STATUS_ACCEPTED
            req.session_id = secrets.token_urlsafe(16)
        else:
            req.status = STATUS_DECLINED
        return req


def cancel(request_id: int, requester_user_id: int) -> ShareRequest:
    with _lock:
        _gc()
        req = _requests.get(request_id)
        if req is None:
            raise KeyError('not found')
        if req.from_user_id != requester_user_id:
            raise PermissionError('not yours to cancel')
        if req.status == STATUS_PENDING:
            req.status = STATUS_EXPIRED
        return req


def get(request_id: int) -> ShareRequest | None:
    with _lock:
        _gc()
        return _requests.get(request_id)


def incoming(user_id: int) -> list[ShareRequest]:
    with _lock:
        _gc()
        return [r for r in _requests.values() if r.to_user_id == user_id and r.status == STATUS_PENDING]


def outgoing(user_id: int) -> list[ShareRequest]:
    with _lock:
        _gc()
        return [r for r in _requests.values() if r.from_user_id == user_id]


def session_belongs_to(session_id: str, user_id: int) -> bool:
    with _lock:
        _gc()
        for req in _requests.values():
            if req.status == STATUS_ACCEPTED and req.session_id == session_id:
                return user_id in (req.from_user_id, req.to_user_id)
    return False
