from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services import share_request as share_svc
from app.services.auth import decode_session_token
from app.services.pair_store import revoke_pair_lease, validate_pair_lease
from app.services.screen_relay import relay

router = APIRouter()


def _resolve_session_id(claims: dict, requested_session: str | None) -> str | None:
    """Pick the session_id to use, enforcing authorization.

    - If a session_id is provided in the URL: only allow when the JWT subject
      is a participant of an accepted ShareRequest with that session.
    - Otherwise: fall back to JWT `sub` (legacy pair-code flow).
    """
    sub = claims.get('sub') or ''
    if requested_session:
        # Device-connect tokens (accountless flow) are minted for one specific
        # session: the host's own `sub`. Both host and viewer carry that same
        # sub, so an exact match is the authorization — a token for device A can
        # never address device B's session.
        if claims.get('scope') in {'device-host', 'device-viewer'}:
            return requested_session if sub and sub == requested_session else None
        if claims.get('scope') == 'user' and sub.startswith('u:'):
            try:
                user_id = int(sub[2:])
            except ValueError:
                return None
            if share_svc.session_belongs_to(requested_session, user_id):
                return requested_session
            return None
        return None
    return sub or None


@router.websocket('/ws/screen')
async def screen_socket(websocket: WebSocket):
    token = websocket.query_params.get('token')
    role = (websocket.query_params.get('role') or '').lower()
    session_param = websocket.query_params.get('session')

    claims = decode_session_token(token)
    if not claims or role not in {'publisher', 'viewer'}:
        await websocket.close(code=1008)
        return

    # A device-connect viewer shares the host's `sub` (that is how both land on
    # the same relay session), so it must be explicitly barred from claiming the
    # publisher slot — otherwise it could stream its own screen to the host.
    if role == 'publisher' and claims.get('scope') == 'device-viewer':
        await websocket.close(code=1008)
        return

    session_id = _resolve_session_id(claims, session_param)
    if not session_id:
        await websocket.close(code=1008)
        return

    # Pair-code sessions (no explicit session param) require a valid one-connection
    # lease embedded in the viewer token. This blocks stale-token reconnects.
    pair_lease_id: str | None = None
    if not session_param and role == 'viewer':
        pair_lease_id = claims.get('pair_lease')
        if not validate_pair_lease(session_id, pair_lease_id):
            await websocket.close(code=1008)
            return

    await websocket.accept()

    if role == 'publisher':
        ok = await relay.register_publisher(session_id, websocket)
        if not ok:
            await websocket.close(code=4001)
            return
        try:
            while True:
                message = await websocket.receive()
                if message.get('type') == 'websocket.disconnect':
                    break
                if 'bytes' in message and message['bytes'] is not None:
                    await relay.broadcast(session_id, message['bytes'])
        except WebSocketDisconnect:
            pass
        finally:
            await relay.unregister_publisher(session_id, websocket)
        return

    await relay.register_viewer(session_id, websocket)
    try:
        while True:
            message = await websocket.receive()
            if message.get('type') == 'websocket.disconnect':
                break
            text = message.get('text')
            if text:
                await relay.send_input(session_id, text)
    except WebSocketDisconnect:
        pass
    finally:
        await relay.unregister_viewer(session_id, websocket)
        if not session_param and role == 'viewer':
            revoke_pair_lease(pair_lease_id)
