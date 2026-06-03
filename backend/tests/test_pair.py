def test_pair_start_requires_token(client):
    assert client.post('/api/v1/pair/start').status_code == 401


def test_pair_start_returns_code(client, token):
    response = client.post('/api/v1/pair/start', headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200
    body = response.json()
    assert len(body['code']) == 6
    assert body['code'].isdigit()
    assert body['expires_in'] > 0


def test_pair_claim_returns_jwt_with_same_sub(client, token):
    import jwt as jwt_lib

    start = client.post('/api/v1/pair/start', headers={'Authorization': f'Bearer {token}'}).json()
    claim = client.post('/api/v1/pair/claim', json={'code': start['code']})
    assert claim.status_code == 200
    new_token = claim.json()['token']

    from app.config import settings
    original = jwt_lib.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    paired = jwt_lib.decode(new_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert original['sub'] == paired['sub']


def test_pair_claim_rejects_bad_code(client):
    response = client.post('/api/v1/pair/claim', json={'code': '000000'})
    assert response.status_code == 404


def test_pair_code_single_use(client, token):
    start = client.post('/api/v1/pair/start', headers={'Authorization': f'Bearer {token}'}).json()
    code = start['code']
    first = client.post('/api/v1/pair/claim', json={'code': code})
    second = client.post('/api/v1/pair/claim', json={'code': code})
    assert first.status_code == 200
    assert second.status_code == 404
