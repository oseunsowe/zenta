import sys


def test_bridge_404_when_disabled(client):
    assert client.post('/api/v1/bridge/inbound', json={'session_id': 's', 'message': 'hi'}).status_code == 404


def test_bridge_requires_token(monkeypatch):
    monkeypatch.setenv('BRIDGE_INBOUND_TOKEN', 'bridge-test')
    for mod in list(sys.modules):
        if mod.startswith('app.'):
            del sys.modules[mod]
    from app.main import app
    from fastapi.testclient import TestClient

    c = TestClient(app)
    assert c.post('/api/v1/bridge/inbound', json={'session_id': 's', 'message': 'hi'}).status_code == 403


def test_bridge_accepts_with_token(monkeypatch):
    monkeypatch.setenv('BRIDGE_INBOUND_TOKEN', 'bridge-test')
    for mod in list(sys.modules):
        if mod.startswith('app.'):
            del sys.modules[mod]
    from app.main import app
    from fastapi.testclient import TestClient

    c = TestClient(app)
    r = c.post(
        '/api/v1/bridge/inbound',
        headers={'X-Bridge-Token': 'bridge-test'},
        json={'session_id': 'slack-user-42', 'message': 'hello from bridge'},
    )
    assert r.status_code == 200
    assert 'hello from bridge' in r.json()['reply']
