from typing import AsyncIterator


class NullSTT:
    async def transcribe(self, audio: bytes, mime: str) -> str:
        return ''


class NullTTS:
    async def synthesize(self, text: str, voice_id: str | None = None) -> AsyncIterator[bytes]:
        if False:
            yield b''
