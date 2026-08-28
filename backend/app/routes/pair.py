import socket

from fastapi import APIRouter, Header, HTTPException, Request

from app.config import settings
from app.schemas import (
    PairClaimRequest,
    PairClaimResponse,
    PairStartResponse,
)
from app.services.auth import decode_session_token, issue_session_token_for_sub
from app.services.pair_store import claim_pair_code, issue_pair_code, issue_pair_lease

router = APIRouter()


def _detect_lan_ip() -> str | None:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))
            ip = s.getsockname()[0]
        finally:
            s.close()
        if ip and not ip.startswith('127.'):
            return ip
    except OSError:
        pass
    return None


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(' ', 1)
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None
    return parts[1].strip()


@router.post('/pair/start', response_model=PairStartResponse)
async def pair_start(request: Request, authorization: str | None = Header(None)):
    claims = decode_session_token(_extract_bearer(authorization))
    if not claims:
        raise HTTPException(status_code=401, detail='Invalid or missing session token')

    code, ttl = issue_pair_code(claims['sub'], label='pair')

    lan_url = None
    ip = _detect_lan_ip()
    if ip:
        port = settings.backend_port
        lan_url = f'http://{ip}:{port}/control?code={code}'

    return PairStartResponse(code=code, expires_in=ttl, lan_url=lan_url)


@router.post('/pair/claim', response_model=PairClaimResponse)
async def pair_claim(payload: PairClaimRequest):
    sub = claim_pair_code(payload.code.strip())
    if not sub:
        raise HTTPException(status_code=404, detail='Pair code expired or invalid')
    lease_id, _ttl = issue_pair_lease(sub)
    token = issue_session_token_for_sub(sub, scope='companion', extra_claims={'pair_lease': lease_id})
    return PairClaimResponse(authorized=True, token=token)
