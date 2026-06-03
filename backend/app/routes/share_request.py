from fastapi import APIRouter, Header, HTTPException

from app.routes.users import require_user
from app.schemas import (
    ShareRequestCreate,
    ShareRequestPublic,
    ShareRequestRespond,
)
from app.services import share_request as svc
from app.services.users import get_users

router = APIRouter()


async def _to_public(req: svc.ShareRequest) -> ShareRequestPublic:
    users = get_users()
    frm = await users.by_id(req.from_user_id)
    to = await users.by_id(req.to_user_id)
    return ShareRequestPublic(
        id=req.id,
        from_username=frm.username if frm else 'unknown',
        to_username=to.username if to else 'unknown',
        note=req.note,
        status=req.status,
        session_id=req.session_id,
        created_at=req.created_at,
        expires_at=req.expires_at,
    )


@router.post('/share-request', response_model=ShareRequestPublic)
async def create_share_request(
    payload: ShareRequestCreate,
    authorization: str | None = Header(None),
):
    user_id = await require_user(authorization)
    target = await get_users().by_username(payload.to_username)
    if target is None:
        raise HTTPException(status_code=404, detail='Target user not found')
    try:
        req = svc.create(user_id, target.id, payload.note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await _to_public(req)


@router.get('/share-request/incoming', response_model=list[ShareRequestPublic])
async def list_incoming(authorization: str | None = Header(None)):
    user_id = await require_user(authorization)
    return [await _to_public(r) for r in svc.incoming(user_id)]


@router.get('/share-request/outgoing', response_model=list[ShareRequestPublic])
async def list_outgoing(authorization: str | None = Header(None)):
    user_id = await require_user(authorization)
    return [await _to_public(r) for r in svc.outgoing(user_id)]


@router.get('/share-request/{request_id}', response_model=ShareRequestPublic)
async def get_share_request(request_id: int, authorization: str | None = Header(None)):
    user_id = await require_user(authorization)
    req = svc.get(request_id)
    if req is None or user_id not in (req.from_user_id, req.to_user_id):
        raise HTTPException(status_code=404)
    return await _to_public(req)


@router.post('/share-request/{request_id}/respond', response_model=ShareRequestPublic)
async def respond_share_request(
    request_id: int,
    payload: ShareRequestRespond,
    authorization: str | None = Header(None),
):
    user_id = await require_user(authorization)
    try:
        req = svc.respond(request_id, user_id, payload.accept)
    except KeyError:
        raise HTTPException(status_code=404)
    except PermissionError:
        raise HTTPException(status_code=403)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return await _to_public(req)


@router.post('/share-request/{request_id}/cancel', response_model=ShareRequestPublic)
async def cancel_share_request(request_id: int, authorization: str | None = Header(None)):
    user_id = await require_user(authorization)
    try:
        req = svc.cancel(request_id, user_id)
    except KeyError:
        raise HTTPException(status_code=404)
    except PermissionError:
        raise HTTPException(status_code=403)
    return await _to_public(req)
