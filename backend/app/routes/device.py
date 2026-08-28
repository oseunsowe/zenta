"""Accountless connect flow: claim an ID, show a password, connect to a partner.

Every endpoint 404s when DEVICE_ACCESS_ENABLED is false, so an invite-gated
deployment is not silently opened up by upgrading.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.services.auth import issue_session_token_for_sub
from app.services.device_store import (
    UNATTENDED_PASSWORD_MAX_LENGTH,
    UNATTENDED_PASSWORD_MIN_LENGTH,
    get_devices,
    is_valid_device_id,
    normalize_device_id,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Session/JWT subject for a device. The screen relay derives session_id from
# `sub`, so host and viewer must end up with the same one.
def device_sub(device_id: str) -> str:
    return f'd:{device_id}'


def _guard() -> None:
    if not settings.device_access_enabled:
        raise HTTPException(status_code=404)


class ClaimRequest(BaseModel):
    device_id: str | None = None
    secret: str | None = None


class ClaimResponse(BaseModel):
    device_id: str
    secret: str
    password: str
    token: str
    unattended_enabled: bool


class RotateRequest(BaseModel):
    device_id: str
    secret: str
    # True for the client's own periodic timer, so a rotation that fires while
    # someone is mid-brute-force does not also clear their lockout. False (the
    # default) is the deliberate "New" button, which does reset it.
    auto: bool = False


class RotateResponse(BaseModel):
    password: str


class SetUnattendedRequest(BaseModel):
    device_id: str
    secret: str
    password: str = Field(min_length=UNATTENDED_PASSWORD_MIN_LENGTH, max_length=UNATTENDED_PASSWORD_MAX_LENGTH)


class UnattendedStatusResponse(BaseModel):
    enabled: bool


class ConnectRequest(BaseModel):
    device_id: str
    password: str = Field(min_length=1, max_length=64)


class ConnectResponse(BaseModel):
    token: str
    session_id: str


@router.post('/device/claim', response_model=ClaimResponse)
@limiter.limit('30/minute')
async def claim(request: Request, payload: ClaimRequest):
    """First launch mints an ID; later launches re-present it with the secret.

    Either way a fresh password is issued, matching how UltraViewer shows a new
    password each time it starts.
    """
    _guard()
    device, secret, password = await get_devices().claim(payload.device_id, payload.secret)
    return ClaimResponse(
        device_id=device.device_id,
        secret=secret,
        password=password,
        # scope 'device-host' may publish its own screen.
        token=issue_session_token_for_sub(device_sub(device.device_id), scope='device-host'),
        unattended_enabled=device.unattended_enabled,
    )


@router.post('/device/rotate', response_model=RotateResponse)
@limiter.limit('30/minute')
async def rotate(request: Request, payload: RotateRequest):
    _guard()
    password = await get_devices().rotate(payload.device_id, payload.secret, reset_lockout=not payload.auto)
    if password is None:
        raise HTTPException(status_code=403, detail='Unknown device or bad secret')
    return RotateResponse(password=password)


@router.post('/device/unattended/set', response_model=UnattendedStatusResponse)
@limiter.limit('10/minute')
async def set_unattended(request: Request, payload: SetUnattendedRequest):
    """Set (or replace) the fixed password used to connect without the owner present.

    Distinct from the rotating password: this one does not expire or change on
    relaunch, so it is what makes unattended access possible.
    """
    _guard()
    ok = await get_devices().set_unattended_password(payload.device_id, payload.secret, payload.password)
    if not ok:
        raise HTTPException(status_code=403, detail='Unknown device or bad secret')
    return UnattendedStatusResponse(enabled=True)


@router.post('/device/unattended/clear', response_model=UnattendedStatusResponse)
@limiter.limit('10/minute')
async def clear_unattended(request: Request, payload: RotateRequest):
    _guard()
    ok = await get_devices().clear_unattended_password(payload.device_id, payload.secret)
    if not ok:
        raise HTTPException(status_code=403, detail='Unknown device or bad secret')
    return UnattendedStatusResponse(enabled=False)


@router.post('/device/connect', response_model=ConnectResponse)
@limiter.limit(settings.device_connect_rate_limit)
async def connect(request: Request, payload: ConnectRequest):
    """Exchange a partner's ID + password for a viewer token on their session."""
    _guard()
    device_id = normalize_device_id(payload.device_id)
    if not is_valid_device_id(device_id):
        raise HTTPException(status_code=400, detail='Device ID must be 9 digits')

    ok, retry_after = await get_devices().verify_password(device_id, payload.password)
    if not ok:
        if retry_after:
            raise HTTPException(
                status_code=429,
                detail=f'Too many failed attempts. Try again in {retry_after}s.',
                headers={'Retry-After': str(retry_after)},
            )
        # Same message for unknown ID and wrong password — do not leak which
        # device IDs are real.
        raise HTTPException(status_code=403, detail='Incorrect ID or password')

    sub = device_sub(device_id)
    return ConnectResponse(
        # scope 'device-viewer' is view/control only — screen.py refuses to let
        # it register as a publisher, so a viewer cannot hijack the host's slot
        # and stream its own screen to the session.
        token=issue_session_token_for_sub(sub, scope='device-viewer'),
        session_id=sub,
    )
