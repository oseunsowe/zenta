from fastapi import APIRouter, Header, WebSocket, WebSocketDisconnect

from app.schemas import ChatRequest, ChatResponse, WebSocketMessage
from app.services.auth import decode_session_token, require_bearer_session
from app.services.chat import generate_reply

router = APIRouter()


@router.post('/chat', response_model=ChatResponse)
async def send_chat(request: ChatRequest, authorization: str | None = Header(None)):
    claims = require_bearer_session(authorization)
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
