import pytest
from fastapi import WebSocketDisconnect


def _viewer_token(client, publisher_token):
    """A viewer-role connection with no `session` param needs a pair lease

    bound to the publisher's sub — mint one the same way the real /share ->
    /view flow does, via /pair/start + /pair/claim.
    """
    start = client.post('/api/v1/pair/start', headers={'Authorization': f'Bearer {publisher_token}'})
    assert start.status_code == 200
    claim = client.post('/api/v1/pair/claim', json={'code': start.json()['code']})
    assert claim.status_code == 200
    return claim.json()['token']


def test_rejects_bad_token(client):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('/api/v1/ws/screen-webrtc?role=publisher&token=nope'):
            pass


def test_rejects_bad_role(client, token):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f'/api/v1/ws/screen-webrtc?role=nope&token={token}'):
            pass


def test_second_viewer_is_rejected(client, token):
    viewer_token = _viewer_token(client, token)
    with client.websocket_connect(f'/api/v1/ws/screen-webrtc?role=publisher&token={token}'):
        with client.websocket_connect(f'/api/v1/ws/screen-webrtc?role=viewer&token={viewer_token}'):
            second_viewer_token = _viewer_token(client, token)
            # The relay accepts the socket before checking slot availability
            # (matches register_publisher's existing slot-taken behavior), so
            # the reject-close only surfaces on the first receive, not at connect.
            with client.websocket_connect(f'/api/v1/ws/screen-webrtc?role=viewer&token={second_viewer_token}') as ws:
                with pytest.raises(WebSocketDisconnect) as exc_info:
                    ws.receive_json()
                assert exc_info.value.code == 4001


def test_offer_answer_relayed_between_publisher_and_viewer(client, token):
    viewer_token = _viewer_token(client, token)
    with client.websocket_connect(f'/api/v1/ws/screen-webrtc?role=publisher&token={token}') as pub:
        with client.websocket_connect(f'/api/v1/ws/screen-webrtc?role=viewer&token={viewer_token}') as view:
            # Publisher learns a viewer is present and sends an offer.
            joined = pub.receive_json()
            assert joined == {'type': 'viewer-joined'}

            pub.send_json({'type': 'offer', 'sdp': 'v=0 fake-offer'})
            offer = view.receive_json()
            assert offer['type'] == 'offer'
            assert offer['sdp'] == 'v=0 fake-offer'

            view.send_json({'type': 'answer', 'sdp': 'v=0 fake-answer'})
            answer = pub.receive_json()
            assert answer['type'] == 'answer'
            assert answer['sdp'] == 'v=0 fake-answer'

            pub.send_json({
                'type': 'ice-candidate',
                'candidate': {'candidate': 'candidate:1 1 UDP 1 127.0.0.1 1 typ host'},
            })
            candidate = view.receive_json()
            assert candidate['type'] == 'ice-candidate'
            assert candidate['candidate']['candidate'].startswith('candidate:1')


def test_device_viewer_cannot_claim_publisher_slot(client):
    """Mirrors the same guard on the legacy /ws/screen endpoint."""
    from app.services.auth import issue_session_token_for_sub

    token = issue_session_token_for_sub('d:1', scope='device-viewer')
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f'/api/v1/ws/screen-webrtc?role=publisher&token={token}'):
            pass
