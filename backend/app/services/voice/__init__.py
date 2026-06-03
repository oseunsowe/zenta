from typing import AsyncIterator, Protocol


class STT(Protocol):
    async def transcribe(self, audio: bytes, mime: str) -> str: ...


class TTS(Protocol):
    async def synthesize(self, text: str, voice_id: str | None = None) -> AsyncIterator[bytes]: ...
