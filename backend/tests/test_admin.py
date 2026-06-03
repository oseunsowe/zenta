from tests.conftest import ADMIN


def test_admin_requires_token(client):
    assert client.get('/api/v1/admin/invite-mode').status_code == 403


def test_admin_rejects_wrong_token(client):
    response = client.get('/api/v1/admin/invite-mode', headers={'X-Admin-Token': 'nope'})
    assert response.status_code == 403


def test_admin_get_state(client):
    response = client.get('/api/v1/admin/invite-mode', headers={'X-Admin-Token': ADMIN})
    assert response.status_code == 200
    assert response.json() == {'invite_only': True}


def test_admin_toggles_and_persists(client, tmp_path, monkeypatch):
    headers = {'X-Admin-Token': ADMIN}
    r = client.post('/api/v1/admin/invite-mode', headers=headers, json={'enabled': False})
    assert r.status_code == 200
    assert r.json() == {'invite_only': False}

    # New TestClient picks up the persisted state from disk.
    import sys
    for mod in list(sys.modules):
        if mod.startswith('app.'):
            del sys.modules[mod]
    from app.main import app
    from fastapi.testclient import TestClient
    c2 = TestClient(app)
    r2 = c2.get('/api/v1/admin/invite-mode', headers=headers)
    assert r2.json() == {'invite_only': False}


def test_admin_hidden_when_no_token_configured(monkeypatch):
    monkeypatch.setenv('ADMIN_TOKEN', '')
    import sys
    for mod in list(sys.modules):
        if mod.startswith('app.'):
            del sys.modules[mod]
    from app.main import app
    from fastapi.testclient import TestClient

    c = TestClient(app)
    assert c.get('/api/v1/admin/invite-mode', headers={'X-Admin-Token': 'anything'}).status_code == 404
