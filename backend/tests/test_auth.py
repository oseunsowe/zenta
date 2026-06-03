from tests.conftest import INVITE, WRONG_INVITE


def test_root_is_silent(client):
    assert client.get('/').status_code == 204


def test_docs_hidden(client):
    assert client.get('/docs').status_code == 404


def test_invalid_invite_rejected(client):
    response = client.post('/api/v1/auth/invite', json={'invite_code': WRONG_INVITE})
    assert response.status_code == 403


def test_valid_invite_issues_jwt(client):
    response = client.post('/api/v1/auth/invite', json={'invite_code': INVITE})
    assert response.status_code == 200
    body = response.json()
    assert body['authorized'] is True
    assert body['token'].count('.') == 2  # header.payload.signature


def test_rate_limit_kicks_in(monkeypatch, tmp_path):
    monkeypatch.setenv('INVITE_RATE_LIMIT', '2/minute')
    import sys
    for mod in list(sys.modules):
        if mod.startswith('app.'):
            del sys.modules[mod]
    from app.main import app
    from fastapi.testclient import TestClient

    c = TestClient(app)
    codes = [c.post('/api/v1/auth/invite', json={'invite_code': WRONG_INVITE}).status_code for _ in range(4)]
    assert 429 in codes
