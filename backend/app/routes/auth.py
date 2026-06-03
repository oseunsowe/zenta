from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.schemas import InviteRequest, InviteResponse
from app.services.auth import issue_session_token, validate_invite_code

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post('/auth/invite', response_model=InviteResponse)
@limiter.limit(settings.invite_rate_limit)
async def check_invite(request: Request, payload: InviteRequest):
    valid = await validate_invite_code(payload.invite_code)
    if not valid:
        raise HTTPException(status_code=403, detail='Invalid invite code')
    token = issue_session_token(payload.invite_code)
    return InviteResponse(authorized=True, token=token)
