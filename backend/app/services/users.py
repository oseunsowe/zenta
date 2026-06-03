import asyncio
import hashlib
import hmac
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

_USERNAME_RE = re.compile(r'^[a-z0-9_]{3,32}$')
_MIN_PASSWORD_LEN = 8


@dataclass
class User:
    id: int
    username: str
    created_at: float


def _password_hash(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 200_000)
    return f'pbkdf2_sha256$200000${salt.hex()}${derived.hex()}'


def _password_verify(password: str, encoded: str) -> bool:
    try:
        scheme, iters, salt_hex, hash_hex = encoded.split('$')
    except ValueError:
        return False
    if scheme != 'pbkdf2_sha256':
        return False
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(hash_hex)
    actual = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, int(iters))
    return hmac.compare_digest(actual, expected)


def normalize_username(username: str) -> str:
    return (username or '').strip().lower()


def is_valid_username(username: str) -> bool:
    return bool(_USERNAME_RE.match(username or ''))


def is_valid_password(password: str) -> bool:
    return isinstance(password, str) and len(password) >= _MIN_PASSWORD_LEN


class UserStore:
    def __init__(self, path: str) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, isolation_level=None)
        conn.execute('PRAGMA journal_mode=WAL')
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
                """
            )

    async def create(self, username: str, password: str) -> User:
        username = normalize_username(username)
        async with self._lock:
            return await asyncio.to_thread(self._create_sync, username, password)

    def _create_sync(self, username: str, password: str) -> User:
        with self._connect() as conn:
            try:
                cur = conn.execute(
                    'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
                    (username, _password_hash(password), time.time()),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError('username taken') from exc
            row = conn.execute(
                'SELECT id, username, created_at FROM users WHERE id = ?',
                (cur.lastrowid,),
            ).fetchone()
        return User(id=row['id'], username=row['username'], created_at=row['created_at'])

    async def authenticate(self, username: str, password: str) -> User | None:
        username = normalize_username(username)
        return await asyncio.to_thread(self._authenticate_sync, username, password)

    def _authenticate_sync(self, username: str, password: str) -> User | None:
        with self._connect() as conn:
            row = conn.execute(
                'SELECT id, username, password_hash, created_at FROM users WHERE username = ?',
                (username,),
            ).fetchone()
        if row is None:
            # Spend roughly the same time as a real verify to reduce username-enumeration.
            _password_verify(password, 'pbkdf2_sha256$200000$' + '0' * 32 + '$' + '0' * 64)
            return None
        if not _password_verify(password, row['password_hash']):
            return None
        return User(id=row['id'], username=row['username'], created_at=row['created_at'])

    async def change_password(self, user_id: int, current_password: str, new_password: str) -> bool:
        """Verify the current password and set a new one. Returns False if the
        current password is wrong or the user no longer exists."""
        async with self._lock:
            return await asyncio.to_thread(self._change_password_sync, user_id, current_password, new_password)

    def _change_password_sync(self, user_id: int, current_password: str, new_password: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                'SELECT password_hash FROM users WHERE id = ?',
                (user_id,),
            ).fetchone()
            if row is None or not _password_verify(current_password, row['password_hash']):
                return False
            conn.execute(
                'UPDATE users SET password_hash = ? WHERE id = ?',
                (_password_hash(new_password), user_id),
            )
        return True

    async def by_id(self, user_id: int) -> User | None:
        return await asyncio.to_thread(self._by_id_sync, user_id)

    def _by_id_sync(self, user_id: int) -> User | None:
        with self._connect() as conn:
            row = conn.execute(
                'SELECT id, username, created_at FROM users WHERE id = ?',
                (user_id,),
            ).fetchone()
        return User(id=row['id'], username=row['username'], created_at=row['created_at']) if row else None

    async def by_username(self, username: str) -> User | None:
        username = normalize_username(username)
        return await asyncio.to_thread(self._by_username_sync, username)

    def _by_username_sync(self, username: str) -> User | None:
        with self._connect() as conn:
            row = conn.execute(
                'SELECT id, username, created_at FROM users WHERE username = ?',
                (username,),
            ).fetchone()
        return User(id=row['id'], username=row['username'], created_at=row['created_at']) if row else None


_instance: UserStore | None = None


def get_users() -> UserStore:
    global _instance
    if _instance is None:
        _instance = UserStore(settings.users_db_path)
    return _instance


def reset_users() -> None:
    global _instance
    _instance = None
