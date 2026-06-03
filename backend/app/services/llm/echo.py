class EchoAdapter:
    async def generate(
        self,
        message: str,
        character_id: str | None,
        history: list[dict] | None = None,
    ) -> str:
        tag = character_id or 'default'
        memory_note = f' (recalling {len(history)} turns)' if history else ''
        return f'Stealth companion response for {tag}{memory_note}: {message}'
