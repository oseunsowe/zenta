import asyncio

import httpx

from app.config import settings


async def fire_outbound(session_id: str, user_message: str, reply: str) -> None:
    url = (settings.webhook_out_url or '').strip()
    if not url:
        return
    payload = {
        'session_id': session_id,
        'user': user_message,
        'reply': reply,
    }
    headers = {'Content-Type': 'application/json'}
    if settings.webhook_out_token:
        headers['Authorization'] = f'Bearer {settings.webhook_out_token}'

    async def _send() -> None:
        try:
            async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                await client.post(url, headers=headers, json=payload)
        except Exception:
            # Outbound failures must never break the chat reply.
            pass

    asyncio.create_task(_send())
