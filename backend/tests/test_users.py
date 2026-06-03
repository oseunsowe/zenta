from tests.conftest import INVITE


def _register(client, username, password='hunter2hunter', invite=INVITE):
    return client.post(
        '/api/v1/auth/register',
        json={'username': username, 'password': password, 'invite_code': invite},
    )


def test_register_requires_invite(client):
    r = _register(client, 'alice', invite='WRONG')
    assert r.status_code == 403


def test_register_rejects_short_password(client):
    r = _register(client, 'alice', password='short')
    assert r.status_code == 400


def test_register_rejects_bad_username(client):
    r = _register(client, 'Bad Name!')
    assert r.status_code == 400


def test_register_succeeds_and_returns_user_jwt(client):
    r = _register(client, 'alice')
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['user']['username'] == 'alice'
    assert body['token'].count('.') == 2


def test_register_rejects_duplicate(client):
    assert _register(client, 'alice').status_code == 200
    assert _register(client, 'alice').status_code == 409


def test_login_succeeds(client):
    _register(client, 'alice', password='goodpassword123')
    r = client.post('/api/v1/auth/login', json={'username': 'alice', 'password': 'goodpassword123'})
    assert r.status_code == 200
    assert r.json()['user']['username'] == 'alice'


def test_login_rejects_wrong_password(client):
    _register(client, 'alice')
    r = client.post('/api/v1/auth/login', json={'username': 'alice', 'password': 'wrong-pw-xx'})
    assert r.status_code == 403


def test_login_rejects_unknown_user(client):
    r = client.post('/api/v1/auth/login', json={'username': 'ghost', 'password': 'anything-here-x'})
    assert r.status_code == 403


def test_me_requires_user_jwt(client, token):
    # token fixture is an INVITE-derived JWT (scope=companion), not a user JWT.
    r = client.get('/api/v1/users/me', headers={'Authorization': f'Bearer {token}'})
    assert r.status_code == 401


def test_me_returns_current_user(client):
    reg = _register(client, 'alice').json()
    r = client.get('/api/v1/users/me', headers={'Authorization': f'Bearer {reg["token"]}'})
    assert r.status_code == 200
    assert r.json() == {'id': reg['user']['id'], 'username': 'alice'}
