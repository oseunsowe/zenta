import hmac

from fastapi import APIRouter, Header, HTTPException

from app.config import settings
from app.schemas import BridgeInboundRequest, ChatResponse
from app.services.chat import generate_reply

router = APIRouter()


def _require_bridge(token: str | None) -> None:
    expected = (settings.bridge_inbound_token or '')
    if not expected:
        raise HTTPException(status_code=404)
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=403)


@router.post('/bridge/inbound', response_model=ChatResponse)
async def inbound(
    payload: BridgeInboundRequest,
    x_bridge_token: str | None = Header(None, alias='X-Bridge-Token'),
):
    _require_bridge(x_bridge_token)
    return await generate_reply(payload.message, payload.character_id, payload.session_id)
