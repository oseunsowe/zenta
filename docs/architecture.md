# Architecture

## Components

| Component | Stack | Purpose |
| --- | --- | --- |
| `frontend/` | Next.js (App Router), TypeScript | Stealth UI, chat, WebSocket client, invite/login overlay |
| `backend/` | FastAPI, PyJWT, slowapi | REST + WebSocket API, invite gating, JWT issuance, LLM adapter |
| `desktop/` | Electron | Hidden runner, screen-capture-invisible window, hotkey toggle, spawns frontend + backend |
| `infra/` | Docker Compose, Caddy template | Private prod deploy bound to loopback + CIDR-gated reverse proxy |

## Auth flow

```
StealthLogin (UI)
    │ invite code
    ▼
POST /api/v1/auth/invite      ──► validates SHA-256(code) against INVITE_CODE_HASHES
    │ JWT (HS256, 8h)              rate-limited per IP (slowapi)
    ▼
localStorage[echoface_session_token]
    │
    ├──► chat:  POST /api/v1/chat  Authorization: Bearer <jwt>
    └──► ws:    /api/v1/ws/companion?token=<jwt>
```

When the backend returns 401/403, the frontend dispatches an `echoface:auth-lost` event; `StealthApp` clears state and returns to the login overlay. WebSocket close code `1008` triggers the same.

## Runtime mutability

| Setting | Where | Mutable at runtime |
| --- | --- | --- |
| Invite codes | `INVITE_CODE_HASHES` env | No (restart required) |
| `invite_only` gate | `runtime_state.json`, admin endpoint | Yes — `POST /api/v1/admin/invite-mode` |
| JWT secret | `JWT_SECRET` env | No (rotation invalidates all tokens) |
| LLM provider | `LLM_PROVIDER` env | No |

The admin endpoint is gated by `X-Admin-Token` (timing-safe compare). When `ADMIN_TOKEN` is empty, the admin surface returns 404.

## LLM adapter

`backend/app/services/llm/` holds a `LLMAdapter` Protocol with two implementations:

- `EchoAdapter` — deterministic offline fallback (no network).
- `GroqAdapter` — POSTs to Groq's OpenAI-compatible `/chat/completions` via `httpx`.

`get_adapter()` in `factory.py` instantiates lazily based on `LLM_PROVIDER`. Failures fall back to `EchoAdapter` so the stealth UI never returns a bare error to the user.

## Network posture

- Backend default bind: `127.0.0.1:8000`. Production exposes only via reverse proxy with a CIDR allow.
- Frontend default bind: `127.0.0.1:3000`.
- CORS allowlist is empty by default. Browser origins must be listed explicitly in `CORS_ALLOW_ORIGINS`.
- `/health` allows only loopback + RFC1918 by default (`HEALTH_ALLOWED_CIDRS`); everyone else gets 404.
- `/docs`, `/redoc`, `/openapi.json` are disabled.

## Desktop stealth posture

See `desktop/README.md`. Key controls: `setContentProtection(true)`, `skipTaskbar`, no `Tray`, neutral `window.__host` bridge, opt-in `app.setLoginItemSettings`.
