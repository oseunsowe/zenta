from typing import AsyncIterator


class NullFaceFrameProvider:
    async def frames(self, text: str, character_id: str | None = None) -> AsyncIterator[bytes]:
        if False:
            yield b''
