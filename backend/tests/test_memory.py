import sys


def _reload_with(monkeypatch, **env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    for mod in list(sys.modules):
        if mod.startswith('app.'):
            del sys.modules[mod]


def test_sqlite_memory_recalls_recent_turns(client, token, tmp_path, monkeypatch):
    sqlite_path = tmp_path / 'mem.sqlite3'
    _reload_with(
        monkeypatch,
        MEMORY_BACKEND='sqlite',
        MEMORY_SQLITE_PATH=str(sqlite_path),
        MEMORY_WINDOW='10',
    )
    from app.services.memory.factory import get_memory, reset_memory
    reset_memory()
    from app.main import app
    from fastapi.testclient import TestClient

    c = TestClient(app)
    invite_resp = c.post('/api/v1/auth/invite', json={'invite_code': 'TEST-INVITE'})
    t = invite_resp.json()['token']
    headers = {'Authorization': f'Bearer {t}'}

    c.post('/api/v1/chat', headers=headers, json={'message': 'first'})
    r2 = c.post('/api/v1/chat', headers=headers, json={'message': 'second'})

    assert r2.status_code == 200
    # Echo adapter includes "(recalling N turns)" when history exists
    assert 'recalling' in r2.json()['reply']


def test_null_memory_has_no_recall(client, token):
    headers = {'Authorization': f'Bearer {token}'}
    r1 = client.post('/api/v1/chat', headers=headers, json={'message': 'first'})
    r2 = client.post('/api/v1/chat', headers=headers, json={'message': 'second'})
    assert 'recalling' not in r1.json()['reply']
    assert 'recalling' not in r2.json()['reply']
