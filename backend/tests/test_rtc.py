def test_ice_servers_requires_token(client):
    assert client.get('/api/v1/rtc/ice-servers').status_code == 401


def test_ice_servers_stun_only_by_default(client, token):
    response = client.get('/api/v1/rtc/ice-servers', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200
    body = response.json()
    assert len(body['iceServers']) == 1
    assert body['iceServers'][0]['urls']
    assert body['iceServers'][0].get('username') is None


def test_ice_servers_includes_turn_when_configured(client, token, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, 'turn_shared_secret', 'shh')
    monkeypatch.setattr(settings, 'turn_urls', 'turn:example.invalid:3478')

    response = client.get('/api/v1/rtc/ice-servers', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200
    servers = response.json()['iceServers']
    assert len(servers) == 2
    turn = servers[1]
    assert turn['urls'] == ['turn:example.invalid:3478']
    assert turn['username']
    assert turn['credential']
