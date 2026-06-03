from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect

from app.schemas import ChatRequest, ChatResponse, WebSocketMessage
from app.services.auth import decode_session_token
from app.services.chat import generate_reply

router = APIRouter()


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(' ', 1)
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None
    return parts[1].strip()


def _require_session(authorization: str | None) -> dict:
    claims = decode_session_token(_extract_bearer(authorization))
    if not claims:
        raise HTTPException(status_code=401, detail='Invalid or missing session token')
    return claims


@router.post('/chat', response_model=ChatResponse)
async def send_chat(request: ChatRequest, authorization: str | None = Header(None)):
    claims = _require_session(authorization)
    return await generate_reply(request.message, request.character_id, claims.get('sub'))


@router.websocket('/ws/companion')
async def companion_socket(websocket: WebSocket):
    claims = decode_session_token(websocket.query_params.get('token'))
    if not claims:
        await websocket.close(code=1008)
        return

    session_id = claims.get('sub')
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            message = WebSocketMessage(**payload)

            if message.type == 'text':
                reply = await generate_reply(message.content, message.character_id, session_id)
                await websocket.send_json(
                    {
                        'type': 'reply',
                        'request_id': message.request_id,
                        'reply': reply.reply,
                    }
                )
            else:
                await websocket.send_json(
                    {
                        'type': 'ack',
                        'payload': message.dict(),
                    }
                )
    except WebSocketDisconnect:
        pass
