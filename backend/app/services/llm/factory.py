from app.config import settings
from app.services.llm import LLMAdapter
from app.services.llm.echo import EchoAdapter


_instance: LLMAdapter | None = None


def get_adapter() -> LLMAdapter:
    global _instance
    if _instance is not None:
        return _instance

    provider = (settings.llm_provider or 'echo').lower()
    if provider == 'groq':
        from app.services.llm.groq import GroqAdapter
        _instance = GroqAdapter()
    else:
        _instance = EchoAdapter()
    return _instance


def reset_adapter() -> None:
    global _instance
    _instance = None
