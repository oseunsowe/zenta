"""Device identities for the UltraViewer-style connect screen.

No accounts and no invite code: a machine claims a permanent numeric ID on
first launch and shows a short password the operator can read out. Anyone who
knows both can open a control session against it.

That makes the password the ONLY thing standing between a stranger and full
mouse/keyboard control, so three things matter here:

* the password is 8 characters from an unambiguous 32-symbol alphabet
  (~2^40 combinations, versus ~2^28 for six lowercase letters) and is easy to
  read aloud — no 0/O or 1/l/I confusion;
* it is stored only as a PBKDF2 hash, like account passwords;
* repeated wrong guesses lock the device with escalating backoff, so an online
  brute force is not viable. Lockout deliberately does NOT rotate the password,
  or an attacker could invalidate the code the operator just read out.

Ownership of an ID is proved by a long random secret held by the client, so a
second machine cannot claim someone else's ID.

A device may ALSO set a second, fixed "unattended" password (user-chosen, does
not rotate). This is what makes reconnecting possible when nobody is at the
host to read out a fresh one-time password — the rotating password stays for
ad-hoc support, the unattended one is for coming back later. Both share the
same failure counter and lockout, so setting one does not weaken the other.
"""

import asyncio
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

# Unambiguous when spoken or typed: no O/0, I/1/l.
PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
PASSWORD_LENGTH = 8
DEVICE_ID_DIGITS = 9

# Escalating lockout after consecutive wrong passwords for one device.
LOCKOUT_THRESHOLD = 5
LOCKOUT_STEPS = (30, 120, 600)  # seconds, then the last value repeats

_DEVICE_ID_RE = re.compile(rf'^\d{{{DEVICE_ID_DIGITS}}}$')


@dataclass
class Device:
    device_id: str
    created_at: float
    password_set_at: float
    unattended_enabled: bool = False


UNATTENDED_PASSWORD_MIN_LENGTH = 8
UNATTENDED_PASSWORD_MAX_LENGTH = 64


def generate_password() -> str:
    return ''.join(secrets.choice(PASSWORD_ALPHABET) for _ in range(PASSWORD_LENGTH))


def generate_device_id() -> str:
    # Never leading zero: the UI groups these in threes and a leading zero looks
    # like a typo when read aloud.
    first = secrets.choice('123456789')
    rest = ''.join(secrets.choice('0123456789') for _ in range(DEVICE_ID_DIGITS - 1))
    return first + rest


def normalize_device_id(value: str) -> str:
    """Accept '129 354 196', '129-354-196' or '129354196'."""
    return re.sub(r'[\s-]', '', value or '')


def is_valid_device_id(value: str) -> bool:
    return bool(_DEVICE_ID_RE.match(value or ''))


def normalize_password(value: str) -> str:
    return (value or '').strip().lower()


def _hash(secret: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac('sha256', secret.encode('utf-8'), salt, 200_000)
    return f'pbkdf2_sha256$200000${salt.hex()}${derived.hex()}'


def _verify(secret: str, encoded: str) -> bool:
    try:
        scheme, iters, salt_hex, hash_hex = encoded.split('$')
    except (ValueError, AttributeError):
        return False
    if scheme != 'pbkdf2_sha256':
        return False
    try:
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        actual = hashlib.pbkdf2_hmac('sha256', secret.encode('utf-8'), salt, int(iters))
    except ValueError:
        return False
    return hmac.compare_digest(actual, expected)


def lockout_seconds(failures: int) -> int:
    """Backoff for the Nth consecutive failure past the threshold."""
    if failures < LOCKOUT_THRESHOLD:
        return 0
    step = failures - LOCKOUT_THRESHOLD
    return LOCKOUT_STEPS[min(step, len(LOCKOUT_STEPS) - 1)]


class DeviceStore:
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
                CREATE TABLE IF NOT EXISTS devices (
                    device_id             TEXT PRIMARY KEY,
                    secret_hash           TEXT NOT NULL,
                    password_hash         TEXT NOT NULL,
                    created_at            REAL NOT NULL,
                    password_set_at       REAL NOT NULL,
                    failures              INTEGER NOT NULL DEFAULT 0,
                    locked_until          REAL NOT NULL DEFAULT 0,
                    unattended_password_hash TEXT
                )
                """
            )
            # Lightweight migration for databases created before the unattended
            # password column existed. No migrations system in this project
            # (see DEPLOYMENT_READINESS_REVIEW.md) — ALTER TABLE is idempotent
            # via the duplicate-column error, which SQLite has no IF NOT EXISTS
            # guard for.
            try:
                conn.execute('ALTER TABLE devices ADD COLUMN unattended_password_hash TEXT')
            except sqlite3.OperationalError as exc:
                if 'duplicate column' not in str(exc).lower():
                    raise

    # ------------------------------------------------------------------ claim
    async def claim(self, device_id: str | None, secret: str | None) -> tuple[Device, str, str]:
        """Return an existing device (when the secret matches) or mint a new one.

        Returns (device, secret, password). The password is plaintext and is the
        only time it is ever readable — afterwards only its hash is stored.
        """
        async with self._lock:
            return await asyncio.to_thread(self._claim_sync, device_id, secret)

    def _claim_sync(self, device_id: str | None, secret: str | None) -> tuple[Device, str, str]:
        now = time.time()
        did = normalize_device_id(device_id or '')

        if did and secret and is_valid_device_id(did):
            with self._connect() as conn:
                row = conn.execute(
                    'SELECT * FROM devices WHERE device_id = ?', (did,)
                ).fetchone()
            # Re-issue a password for a device we already know, but only to a
            # client that can prove it owns the ID.
            if row is not None and _verify(secret, row['secret_hash']):
                password = generate_password()
                with self._connect() as conn:
                    conn.execute(
                        'UPDATE devices SET password_hash = ?, password_set_at = ?, '
                        'failures = 0, locked_until = 0 WHERE device_id = ?',
                        (_hash(password), now, did),
                    )
                return (
                    Device(did, row['created_at'], now, row['unattended_password_hash'] is not None),
                    secret,
                    password,
                )

        # Unknown ID, wrong secret, or first run: mint a fresh identity. We never
        # hand back an existing ID without proof, so a guessed ID gains nothing.
        new_secret = secrets.token_urlsafe(32)
        password = generate_password()
        for _ in range(10):
            candidate = generate_device_id()
            try:
                with self._connect() as conn:
                    conn.execute(
                        'INSERT INTO devices (device_id, secret_hash, password_hash, '
                        'created_at, password_set_at) VALUES (?, ?, ?, ?, ?)',
                        (candidate, _hash(new_secret), _hash(password), now, now),
                    )
                return Device(candidate, now, now), new_secret, password
            except sqlite3.IntegrityError:
                continue  # astronomically unlikely collision; try again
        raise RuntimeError('could not allocate a device id')

    # ----------------------------------------------------------------- rotate
    async def rotate(self, device_id: str, secret: str, *, reset_lockout: bool = True) -> str | None:
        async with self._lock:
            return await asyncio.to_thread(self._rotate_sync, device_id, secret, reset_lockout)

    def _rotate_sync(self, device_id: str, secret: str, reset_lockout: bool) -> str | None:
        did = normalize_device_id(device_id)
        with self._connect() as conn:
            row = conn.execute('SELECT * FROM devices WHERE device_id = ?', (did,)).fetchone()
        if row is None or not _verify(secret, row['secret_hash']):
            return None
        password = generate_password()
        with self._connect() as conn:
            if reset_lockout:
                conn.execute(
                    'UPDATE devices SET password_hash = ?, password_set_at = ?, '
                    'failures = 0, locked_until = 0 WHERE device_id = ?',
                    (_hash(password), time.time(), did),
                )
            else:
                # Automatic (unattended, timer-driven) rotation: change the
                # password without clearing an in-progress lockout, or a
                # scheduled rotation would hand a brute-forcer a fresh backoff
                # window every cycle.
                conn.execute(
                    'UPDATE devices SET password_hash = ?, password_set_at = ? WHERE device_id = ?',
                    (_hash(password), time.time(), did),
                )
        return password

    # ---------------------------------------------------------------- connect
    async def verify_password(self, device_id: str, password: str) -> tuple[bool, int]:
        """Check a connect attempt.

        Returns (ok, retry_after_seconds). retry_after is non-zero only while
        the device is locked out.
        """
        async with self._lock:
            return await asyncio.to_thread(self._verify_sync, device_id, password)

    def _verify_sync(self, device_id: str, password: str) -> tuple[bool, int]:
        did = normalize_device_id(device_id)
        now = time.time()
        with self._connect() as conn:
            row = conn.execute('SELECT * FROM devices WHERE device_id = ?', (did,)).fetchone()

        # Unknown ID and wrong password are reported identically, so the API
        # cannot be used to enumerate which device IDs exist.
        if row is None:
            return False, 0

        if row['locked_until'] > now:
            return False, int(row['locked_until'] - now) + 1

        normalized = normalize_password(password)
        matched = _verify(normalized, row['password_hash']) or (
            row['unattended_password_hash'] is not None
            and _verify(normalized, row['unattended_password_hash'])
        )
        if matched:
            with self._connect() as conn:
                conn.execute(
                    'UPDATE devices SET failures = 0, locked_until = 0 WHERE device_id = ?',
                    (did,),
                )
            return True, 0

        failures = int(row['failures']) + 1
        wait = lockout_seconds(failures)
        with self._connect() as conn:
            conn.execute(
                'UPDATE devices SET failures = ?, locked_until = ? WHERE device_id = ?',
                (failures, now + wait if wait else 0, did),
            )
        return False, wait

    # ------------------------------------------------------------ unattended
    async def set_unattended_password(self, device_id: str, secret: str, password: str) -> bool:
        async with self._lock:
            return await asyncio.to_thread(self._set_unattended_sync, device_id, secret, password)

    def _set_unattended_sync(self, device_id: str, secret: str, password: str) -> bool:
        did = normalize_device_id(device_id)
        with self._connect() as conn:
            row = conn.execute('SELECT * FROM devices WHERE device_id = ?', (did,)).fetchone()
        if row is None or not _verify(secret, row['secret_hash']):
            return False
        with self._connect() as conn:
            conn.execute(
                'UPDATE devices SET unattended_password_hash = ? WHERE device_id = ?',
                (_hash(normalize_password(password)), did),
            )
        return True

    async def clear_unattended_password(self, device_id: str, secret: str) -> bool:
        async with self._lock:
            return await asyncio.to_thread(self._clear_unattended_sync, device_id, secret)

    def _clear_unattended_sync(self, device_id: str, secret: str) -> bool:
        did = normalize_device_id(device_id)
        with self._connect() as conn:
            row = conn.execute('SELECT * FROM devices WHERE device_id = ?', (did,)).fetchone()
        if row is None or not _verify(secret, row['secret_hash']):
            return False
        with self._connect() as conn:
            conn.execute(
                'UPDATE devices SET unattended_password_hash = NULL WHERE device_id = ?',
                (did,),
            )
        return True

    async def exists(self, device_id: str) -> bool:
        def _q() -> bool:
            with self._connect() as conn:
                return conn.execute(
                    'SELECT 1 FROM devices WHERE device_id = ?',
                    (normalize_device_id(device_id),),
                ).fetchone() is not None

        return await asyncio.to_thread(_q)


_store: DeviceStore | None = None


def get_devices() -> DeviceStore:
    global _store
    if _store is None:
        from app.config import settings

        _store = DeviceStore(settings.devices_db_path)
    return _store
