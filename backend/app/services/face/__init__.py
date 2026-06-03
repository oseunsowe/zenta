from typing import AsyncIterator, Protocol


class FaceFrameProvider(Protocol):
    async def frames(self, text: str, character_id: str | None = None) -> AsyncIterator[bytes]: ...
