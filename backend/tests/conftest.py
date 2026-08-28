import hashlib
import os
import secrets
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure the backend package is importable when pytest is invoked from any cwd.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

INVITE = 'TEST-INVITE'
WRONG_INVITE = 'NOPE'
ADMIN = 'admin-test-token'
JWT_SECRET = secrets.token_urlsafe(32)


@pytest.fixture(autouse=True)
def _isolated_env(tmp_path, monkeypatch):
    monkeypatch.setenv('INVITE_ONLY', 'true')
    monkeypatch.setenv('INVITE_CODE_HASHES', hashlib.sha256(INVITE.encode()).hexdigest())
    monkeypatch.setenv('JWT_SECRET', JWT_SECRET)
    monkeypatch.setenv('JWT_TTL_SECONDS', '60')
    monkeypatch.setenv('ADMIN_TOKEN', ADMIN)
    monkeypatch.setenv('STATE_FILE', str(tmp_path / 'state.json'))
    monkeypatch.setenv('INVITE_RATE_LIMIT', '1000/minute')
    monkeypatch.setenv('LLM_PROVIDER', 'echo')
    monkeypatch.setenv('USERS_DB_PATH', str(tmp_path / 'users.sqlite3'))
    monkeypatch.setenv('DEVICES_DB_PATH', str(tmp_path / 'devices.sqlite3'))
    monkeypatch.setenv('DEVICE_ACCESS_ENABLED', 'true')
    monkeypatch.setenv('DEVICE_CONNECT_RATE_LIMIT', '1000/minute')

    # Wipe modules so settings + state reload with new env.
    for mod in list(sys.modules):
        if mod.startswith('app.'):
            del sys.modules[mod]
    yield


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture
def token(client):
    response = client.post('/api/v1/auth/invite', json={'invite_code': INVITE})
    assert response.status_code == 200, response.text
    return response.json()['token']
