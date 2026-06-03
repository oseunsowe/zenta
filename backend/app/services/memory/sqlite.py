import asyncio
import sqlite3
import time
from pathlib import Path


class SqliteMemory:
    def __init__(self, path: str) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, isolation_level=None)
        conn.execute('PRAGMA journal_mode=WAL')
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    ts REAL NOT NULL
                )
                """
            )
            conn.execute('CREATE INDEX IF NOT EXISTS idx_session_ts ON messages(session_id, ts)')

    async def append(self, session_id: str, role: str, content: str) -> None:
        async with self._lock:
            await asyncio.to_thread(self._append_sync, session_id, role, content)

    def _append_sync(self, session_id: str, role: str, content: str) -> None:
        with self._connect() as conn:
            conn.execute(
                'INSERT INTO messages (session_id, role, content, ts) VALUES (?, ?, ?, ?)',
                (session_id, role, content, time.time()),
            )

    async def recent(self, session_id: str, limit: int = 10) -> list[dict]:
        return await asyncio.to_thread(self._recent_sync, session_id, limit)

    def _recent_sync(self, session_id: str, limit: int) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                'SELECT role, content FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT ?',
                (session_id, limit),
            ).fetchall()
        return [{'role': role, 'content': content} for role, content in reversed(rows)]

    async def clear(self, session_id: str) -> None:
        async with self._lock:
            await asyncio.to_thread(self._clear_sync, session_id)

    def _clear_sync(self, session_id: str) -> None:
        with self._connect() as conn:
            conn.execute('DELETE FROM messages WHERE session_id = ?', (session_id,))
