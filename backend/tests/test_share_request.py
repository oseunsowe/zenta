from tests.conftest import INVITE


def _register(client, username):
    r = client.post(
        '/api/v1/auth/register',
        json={'username': username, 'password': 'a-good-password-1', 'invite_code': INVITE},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_share_request_full_flow(client):
    alice = _register(client, 'alice')
    bob = _register(client, 'bob')

    # Alice asks Bob to share his screen.
    create = client.post(
        '/api/v1/share-request',
        headers=_auth(alice['token']),
        json={'to_username': 'bob', 'note': 'debugging checkout'},
    )
    assert create.status_code == 200, create.text
    req = create.json()
    assert req['from_username'] == 'alice'
    assert req['to_username'] == 'bob'
    assert req['status'] == 'pending'
    assert req['session_id'] is None

    # Bob sees it.
    incoming = client.get('/api/v1/share-request/incoming', headers=_auth(bob['token']))
    assert incoming.status_code == 200
    assert [r['id'] for r in incoming.json()] == [req['id']]

    # Bob accepts.
    accept = client.post(
        f'/api/v1/share-request/{req["id"]}/respond',
        headers=_auth(bob['token']),
        json={'accept': True},
    )
    assert accept.status_code == 200
    assert accept.json()['status'] == 'accepted'
    assert accept.json()['session_id']

    # Alice now sees the accepted session.
    outgoing = client.get('/api/v1/share-request/outgoing', headers=_auth(alice['token']))
    accepted = [r for r in outgoing.json() if r['id'] == req['id']][0]
    assert accepted['status'] == 'accepted'
    assert accepted['session_id'] == accept.json()['session_id']


def test_only_target_can_accept(client):
    alice = _register(client, 'alice')
    bob = _register(client, 'bob')
    eve = _register(client, 'eve')

    create = client.post(
        '/api/v1/share-request',
        headers=_auth(alice['token']),
        json={'to_username': 'bob'},
    )
    req_id = create.json()['id']

    bad = client.post(
        f'/api/v1/share-request/{req_id}/respond',
        headers=_auth(eve['token']),
        json={'accept': True},
    )
    assert bad.status_code == 403


def test_decline_marks_declined(client):
    alice = _register(client, 'alice')
    bob = _register(client, 'bob')
    create = client.post(
        '/api/v1/share-request',
        headers=_auth(alice['token']),
        json={'to_username': 'bob'},
    )
    decline = client.post(
        f'/api/v1/share-request/{create.json()["id"]}/respond',
        headers=_auth(bob['token']),
        json={'accept': False},
    )
    assert decline.status_code == 200
    assert decline.json()['status'] == 'declined'
    assert decline.json()['session_id'] is None


def test_cant_request_self(client):
    alice = _register(client, 'alice')
    r = client.post(
        '/api/v1/share-request',
        headers=_auth(alice['token']),
        json={'to_username': 'alice'},
    )
    assert r.status_code == 400


def test_target_not_found(client):
    alice = _register(client, 'alice')
    r = client.post(
        '/api/v1/share-request',
        headers=_auth(alice['token']),
        json={'to_username': 'ghost'},
    )
    assert r.status_code == 404


def test_session_belongs_to_participants(client):
    """Once accepted, the session_id should authorize the WS for both users."""
    from app.services import share_request as svc

    alice = _register(client, 'alice')
    bob = _register(client, 'bob')
    create = client.post(
        '/api/v1/share-request', headers=_auth(alice['token']), json={'to_username': 'bob'}
    )
    req_id = create.json()['id']
    accept = client.post(
        f'/api/v1/share-request/{req_id}/respond',
        headers=_auth(bob['token']),
        json={'accept': True},
    )
    session_id = accept.json()['session_id']

    assert svc.session_belongs_to(session_id, alice['user']['id']) is True
    assert svc.session_belongs_to(session_id, bob['user']['id']) is True
    assert svc.session_belongs_to(session_id, 99999) is False
    assert svc.session_belongs_to('bogus-session', alice['user']['id']) is False
