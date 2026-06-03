class NullMemory:
    async def append(self, session_id: str, role: str, content: str) -> None:
        return None

    async def recent(self, session_id: str, limit: int = 10) -> list[dict]:
        return []

    async def clear(self, session_id: str) -> None:
        return None
