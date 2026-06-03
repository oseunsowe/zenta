def test_chat_requires_bearer(client):
    response = client.post('/api/v1/chat', json={'message': 'hi'})
    assert response.status_code == 401


def test_chat_rejects_invalid_jwt(client):
    response = client.post(
        '/api/v1/chat',
        headers={'Authorization': 'Bearer not.a.jwt'},
        json={'message': 'hi'},
    )
    assert response.status_code == 401


def test_chat_with_valid_jwt(client, token):
    response = client.post(
        '/api/v1/chat',
        headers={'Authorization': f'Bearer {token}'},
        json={'message': 'hello'},
    )
    assert response.status_code == 200
    assert 'hello' in response.json()['reply']


def test_ws_rejects_bad_token(client):
    from fastapi import WebSocketDisconnect
    import pytest

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/api/v1/ws/companion?token=nope') as ws:
            ws.receive_json()


def test_ws_accepts_valid_token(client, token):
    with client.websocket_connect(f'/api/v1/ws/companion?token={token}') as ws:
        ws.send_json({'type': 'text', 'content': 'hi', 'request_id': 'r1'})
        msg = ws.receive_json()
        assert msg['type'] == 'reply'
        assert msg['request_id'] == 'r1'
