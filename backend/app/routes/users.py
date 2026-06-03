from fastapi import APIRouter, Header, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UserResponse,
)
from app.services.auth import (
    decode_session_token,
    issue_session_token_for_sub,
    validate_invite_code,
)
from app.services.users import (
    get_users,
    is_valid_password,
    is_valid_username,
    normalize_username,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _user_token(user_id: int) -> str:
    return issue_session_token_for_sub(f'u:{user_id}', scope='user')


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(' ', 1)
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None
    return parts[1].strip()


async def require_user(authorization: str | None) -> int:
    claims = decode_session_token(_extract_bearer(authorization))
    if not claims or claims.get('scope') != 'user':
        raise HTTPException(status_code=401, detail='Login required')
    sub = claims.get('sub') or ''
    if not sub.startswith('u:'):
        raise HTTPException(status_code=401, detail='Invalid token')
    try:
        return int(sub[2:])
    except ValueError:
        raise HTTPException(status_code=401, detail='Invalid token')


@router.post('/auth/register', response_model=LoginResponse)
@limiter.limit('5/minute')
async def register(request: Request, payload: RegisterRequest):
    username = normalize_username(payload.username)
    if not is_valid_username(username):
        raise HTTPException(status_code=400, detail='Username must be 3-32 chars, [a-z0-9_]')
    if not is_valid_password(payload.password):
        raise HTTPException(status_code=400, detail='Password must be at least 8 characters')

    if settings.require_invite_for_register:
        ok = await validate_invite_code(payload.invite_code or '')
        if not ok:
            raise HTTPException(status_code=403, detail='Valid invite code required to register')

    users = get_users()
    try:
        user = await users.create(username, payload.password)
    except ValueError:
        raise HTTPException(status_code=409, detail='Username taken')

    return LoginResponse(
        token=_user_token(user.id),
        user=UserResponse(id=user.id, username=user.username),
    )


@router.post('/auth/login', response_model=LoginResponse)
@limiter.limit('10/minute')
async def login(request: Request, payload: LoginRequest):
    users = get_users()
    user = await users.authenticate(payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=403, detail='Invalid username or password')
    return LoginResponse(
        token=_user_token(user.id),
        user=UserResponse(id=user.id, username=user.username),
    )


@router.get('/users/me', response_model=UserResponse)
async def me(authorization: str | None = Header(None)):
    user_id = await require_user(authorization)
    user = await get_users().by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')
    return UserResponse(id=user.id, username=user.username)


@router.post('/auth/change-password', response_model=UserResponse)
@limiter.limit('5/minute')
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    authorization: str | None = Header(None),
):
    user_id = await require_user(authorization)
    if not is_valid_password(payload.new_password):
        raise HTTPException(status_code=400, detail='Password must be at least 8 characters')
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail='New password must differ from the current one')

    ok = await get_users().change_password(user_id, payload.current_password, payload.new_password)
    if not ok:
        raise HTTPException(status_code=403, detail='Current password is incorrect')

    user = await get_users().by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail='User not found')
    return UserResponse(id=user.id, username=user.username)
