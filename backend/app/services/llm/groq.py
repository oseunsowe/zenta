import httpx

from app.config import settings


_SYSTEM_PROMPTS = {
    'aria': 'You are Aria, an empathetic and curious emotional AI companion.',
    'default': 'You are a calm, supportive AI companion. Keep responses short and warm.',
}


def _system_prompt(character_id: str | None) -> str:
    return _SYSTEM_PROMPTS.get(character_id or 'default', _SYSTEM_PROMPTS['default'])


class GroqAdapter:
    def __init__(self) -> None:
        if not settings.llm_api_key:
            raise RuntimeError('LLM_API_KEY is required for the groq provider')
        self._headers = {
            'Authorization': f'Bearer {settings.llm_api_key}',
            'Content-Type': 'application/json',
        }
        self._url = f'{settings.llm_base_url.rstrip("/")}/chat/completions'
        self._timeout = settings.llm_timeout_seconds

    async def generate(
        self,
        message: str,
        character_id: str | None,
        history: list[dict] | None = None,
    ) -> str:
        messages = [{'role': 'system', 'content': _system_prompt(character_id)}]
        if history:
            messages.extend(history)
        messages.append({'role': 'user', 'content': message})

        body = {
            'model': settings.llm_model,
            'messages': messages,
            'temperature': 0.7,
            'max_tokens': 256,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(self._url, headers=self._headers, json=body)
            response.raise_for_status()
            data = response.json()
        try:
            return data['choices'][0]['message']['content'].strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError('Unexpected LLM response shape') from exc
