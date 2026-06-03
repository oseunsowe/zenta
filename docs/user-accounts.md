# User accounts & share requests

A username/password layer that sits **alongside** the existing invite-code flow. Daily users register once, log in with username+password, and request screen shares from each other by username (the AnyDesk model).

## Two parallel auth paths

| Path | Use case | JWT scope |
| --- | --- | --- |
| **Invite code → JWT** (existing) | Ad-hoc/anonymous sessions, embed widget, /pair flow | `companion` |
| **Username/password → JWT** (new) | Repeat users, contact-by-username, share requests | `user` |

Both paths produce JWTs the screen relay accepts. Pair codes still work; user accounts add a friendly DX on top.

## Registration gate

`/api/v1/auth/register` requires a valid invite code by default (`REQUIRE_INVITE_FOR_REGISTER=true` in `.env`). This keeps the platform invite-only while letting trusted users self-register. Flip to `false` for a fully open signup.

The auth route schema:

| Endpoint | Body | Returns |
| --- | --- | --- |
| `POST /api/v1/auth/register` | `{username, password, invite_code}` | `{token, user}` |
| `POST /api/v1/auth/login` | `{username, password}` | `{token, user}` |
| `GET /api/v1/users/me` | (Bearer) | `{id, username}` |

Username rules: `[a-z0-9_]{3,32}`. Passwords: minimum 8 chars, hashed with PBKDF2-SHA256 (200,000 iterations).

## Share-request flow (the AnyDesk equivalent)

```
Alice                                Bob
  │                                   │
  │ POST /share-request               │
  │   {to_username: "bob"}            │
  ├──────────────────────────────────►│
  │                                   │  GET /share-request/incoming
  │                                   │  (polled every 3s in UI, sees Alice's request)
  │                                   │
  │                                   │  POST /share-request/:id/respond
  │                                   │    {accept: true}
  │                                   ├──► backend mints a fresh session_id
  │                                   │
  │ GET /share-request/outgoing       │
  │ (sees status=accepted, session_id)│
  │                                   │
  │ navigates to                      │  navigates to
  │ /view?session=XXX                 │  /share?session=XXX
  │                                   │
  └─────────────► WS /ws/screen?session=XXX ◄──────────┘
          (publisher streams JPEG, viewer renders)
```

The viewer (Alice) ends up at `/view?session=XXX`. The publisher (Bob) ends up at `/share?session=XXX` and is prompted by the browser to pick **tab / window / entire screen**.

The `/contacts` page polls `/share-request/outgoing` every 3 seconds and auto-redirects to `/view?session=XXX` once Bob accepts.

The `/requests` page polls `/share-request/incoming` every 3 seconds; Accept routes Bob to `/share?session=XXX`.

## Pages

| Path | Purpose |
| --- | --- |
| `/login` | Sign in / register (mode toggle in the same UI) |
| `/contacts` | Logged-in landing — send share requests, see outgoing |
| `/requests` | Incoming share requests with Accept / Decline buttons |
| `/share?session=XXX` | Browser screen-capture, streams to anyone authorized for `XXX` |
| `/view?session=XXX` | Receives frames for `XXX` |

The screen WebSocket validates the session at handshake time: only participants of the accepted share-request can connect to `/ws/screen?session=XXX&token=<user JWT>`.

## Security & threat model

- Passwords PBKDF2-SHA256 (200k iters) with random salt; constant-time compare on verify.
- Login + register both rate-limited per IP (slowapi: 10/min, 5/min).
- Username enumeration: failed logins on an unknown username spend roughly the same time as a failed verify (we run a dummy verify). Not perfect — pair with a CAPTCHA at the ingress for production.
- JWT scope tag (`user` vs `companion`) prevents a stolen invite-derived token from posting share requests.
- A session_id only authorizes its two registered participants. Other users connecting to `/ws/screen?session=...` get 1008.
- Share-requests TTL = 5 minutes (configurable via `SHARE_REQUEST_TTL`). Terminal requests (accepted/declined) are GC'd after 1 hour.

## What's NOT here (deliberately)

- **Friend lists / search** — users connect by typing a username. Add a directory endpoint later if you want auto-complete; for now, usernames pass between people out-of-band.
- **Real-time push of incoming requests** — the UI polls every 3 seconds. Trivial to upgrade to WebSocket later if poll cost matters.
- **Password reset / email verification** — needs an email provider decision. Out of scope.
- **Per-session permissions** (read-only vs control) — at the moment any participant can publish or view, gated only by `role` in the URL. Add a permission field on the share-request when you ship remote control.

## Env additions

```env
# User accounts
USERS_DB_PATH=users.sqlite3
REQUIRE_INVITE_FOR_REGISTER=true
SHARE_REQUEST_TTL=300
```
