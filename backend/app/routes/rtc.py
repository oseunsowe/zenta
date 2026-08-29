from fastapi import APIRouter, Header

from app.config import settings
from app.schemas import IceServer, IceServersResponse
from app.services.auth import require_bearer_session
from app.services.turn import generate_turn_credentials

router = APIRouter()


@router.get('/rtc/ice-servers', response_model=IceServersResponse)
async def ice_servers(authorization: str | None = Header(None)):
    claims = require_bearer_session(authorization)

    servers = [IceServer(urls=[u.strip() for u in settings.stun_urls.split(',') if u.strip()])]

    creds = generate_turn_credentials(label=claims.get('sub', 'anon'))
    if creds and settings.turn_urls:
        servers.append(IceServer(
            urls=[u.strip() for u in settings.turn_urls.split(',') if u.strip()],
            username=creds['username'],
            credential=creds['credential'],
        ))

    return IceServersResponse(iceServers=servers)
