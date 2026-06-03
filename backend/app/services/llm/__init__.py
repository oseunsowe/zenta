from typing import Protocol


class LLMAdapter(Protocol):
    async def generate(
        self,
        message: str,
        character_id: str | None,
        history: list[dict] | None = None,
    ) -> str: ...
