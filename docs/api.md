# API Contract

Base URL: `http://127.0.0.1:8000` (dev).
All endpoints under `/api/v1` unless noted.

## Conventions

- All requests/responses are JSON.
- Auth: invite code → JWT. Subsequent endpoints require `Authorization: Bearer <jwt>` (REST) or `?token=<jwt>` (WebSocket).
- Errors: standard HTTP codes with `{"detail": "<reason>"}` body.

## POST /api/v1/auth/invite

Exchange an invite code for a session JWT.

**Request**
```json
{ "invite_code": "STEALTH-XXXX" }
```

**Responses**
- `200` → `{ "authorized": true, "token": "<jwt>" }`
- `403` → invalid code
- `429` → rate-limited (default 5/minute per IP)

## POST /api/v1/chat

Send a single chat turn.

**Headers**: `Authorization: Bearer <jwt>`

**Request**
```json
{ "message": "hello", "character_id": "aria" }
```

**Responses**
- `200` → `{ "reply": "...", "stream": false }`
- `401` → missing / invalid / expired JWT

## WebSocket /api/v1/ws/companion

Streaming chat over WebSocket.

**Query**: `?token=<jwt>`

**Client → server**
```json
{ "type": "text", "content": "hello", "character_id": "aria", "request_id": "r1" }
```

**Server → client (reply)**
```json
{ "type": "reply", "request_id": "r1", "reply": "..." }
```

**Server → client (ack for non-text)**
```json
{ "type": "ack", "payload": { ... } }
```

**Close codes**
- `1008` → policy violation (bad/expired token). Client should clear stored token and prompt re-auth.

## Admin endpoints (gated)

Require `X-Admin-Token: <ADMIN_TOKEN>`. If `ADMIN_TOKEN` is empty in env, all admin endpoints return `404`.

### GET /api/v1/admin/invite-mode
- `200` → `{ "invite_only": true|false }`

### POST /api/v1/admin/invite-mode
- Request: `{ "enabled": true|false }`
- `200` → `{ "invite_only": true|false }`
- State is persisted to `runtime_state.json` and survives restarts.

## Health

### GET /health
- `200` `{ "status": "ok" }` — only from clients in `HEALTH_ALLOWED_CIDRS` (loopback + RFC1918 default)
- `404` — everyone else (no info leaked)

### GET /
- `204` — root returns no content (no service banner)
