from app.config import settings
from app.schemas import ChatResponse
from app.services.llm.echo import EchoAdapter
from app.services.llm.factory import get_adapter
from app.services.memory.factory import get_memory
from app.services.webhook import fire_outbound


_fallback = EchoAdapter()


async def generate_reply(
    message: str,
    character_id: str | None = None,
    session_id: str | None = None,
) -> ChatResponse:
    memory = get_memory()
    history: list[dict] = []
    if session_id:
        history = await memory.recent(session_id, settings.memory_window)

    try:
        adapter = get_adapter()
        reply = await adapter.generate(message, character_id, history)
    except Exception:
        reply = await _fallback.generate(message, character_id, history)

    if session_id:
        await memory.append(session_id, 'user', message)
        await memory.append(session_id, 'assistant', reply)
        await fire_outbound(session_id, message, reply)

    return ChatResponse(reply=reply, stream=False)
