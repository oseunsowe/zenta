import hmac
from fastapi import APIRouter, Header, HTTPException

from app.config import settings
from app.schemas import InviteModeRequest, InviteModeResponse
from app.services.admin_state import is_invite_only, set_invite_only

router = APIRouter()


def _require_admin(token: str | None) -> None:
    expected = settings.admin_token or ''
    if not expected:
        raise HTTPException(status_code=404)
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=403)


@router.get('/admin/invite-mode', response_model=InviteModeResponse)
async def get_invite_mode(x_admin_token: str | None = Header(None, alias='X-Admin-Token')):
    _require_admin(x_admin_token)
    return InviteModeResponse(invite_only=is_invite_only())


@router.post('/admin/invite-mode', response_model=InviteModeResponse)
async def update_invite_mode(
    payload: InviteModeRequest,
    x_admin_token: str | None = Header(None, alias='X-Admin-Token'),
):
    _require_admin(x_admin_token)
    set_invite_only(payload.enabled)
    return InviteModeResponse(invite_only=is_invite_only())
