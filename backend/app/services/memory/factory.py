from app.config import settings
from app.services.memory import MemoryStore
from app.services.memory.null import NullMemory


_instance: MemoryStore | None = None


def get_memory() -> MemoryStore:
    global _instance
    if _instance is not None:
        return _instance

    backend = (settings.memory_backend or 'null').lower()
    if backend == 'sqlite':
        from app.services.memory.sqlite import SqliteMemory
        _instance = SqliteMemory(settings.memory_sqlite_path)
    else:
        _instance = NullMemory()
    return _instance


def reset_memory() -> None:
    global _instance
    _instance = None
