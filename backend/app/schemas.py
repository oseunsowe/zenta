from typing import Literal

from pydantic import BaseModel

class CharacterInfo(BaseModel):
    id: str
    name: str
    description: str

class ChatRequest(BaseModel):
    message: str
    character_id: str | None = None

class ChatResponse(BaseModel):
    reply: str
    stream: bool = False

class InviteRequest(BaseModel):
    invite_code: str

class InviteResponse(BaseModel):
    authorized: bool
    token: str

class WebSocketMessage(BaseModel):
    type: str
    content: str
    character_id: str | None = None
    request_id: str | None = None

class InviteModeRequest(BaseModel):
    enabled: bool

class InviteModeResponse(BaseModel):
    invite_only: bool

class PairStartResponse(BaseModel):
    code: str
    expires_in: int
    lan_url: str | None = None

class PairClaimRequest(BaseModel):
    code: str

class PairClaimResponse(BaseModel):
    authorized: bool
    token: str

class BridgeInboundRequest(BaseModel):
    session_id: str
    message: str
    character_id: str | None = None

class RegisterRequest(BaseModel):
    username: str
    password: str
    invite_code: str | None = None

class LoginRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class UserResponse(BaseModel):
    id: int
    username: str

class LoginResponse(BaseModel):
    token: str
    user: UserResponse

class ShareRequestCreate(BaseModel):
    to_username: str
    note: str | None = None

class ShareRequestRespond(BaseModel):
    accept: bool

class ShareRequestPublic(BaseModel):
    id: int
    from_username: str
    to_username: str
    note: str | None = None
    status: str
    session_id: str | None = None
    created_at: float
    expires_at: float

class IceCandidatePayload(BaseModel):
    candidate: str
    sdpMid: str | None = None
    sdpMLineIndex: int | None = None

class SignalMessage(BaseModel):
    type: Literal['offer', 'answer', 'ice-candidate', 'hangup', 'viewer-joined']
    sdp: str | None = None
    candidate: IceCandidatePayload | None = None

class IceServer(BaseModel):
    urls: list[str]
    username: str | None = None
    credential: str | None = None

class IceServersResponse(BaseModel):
    iceServers: list[IceServer]
