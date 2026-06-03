# Pairing

A pair flow lets a second device — typically a phone — control a session that's already authenticated on the desktop. Both devices end up with their own JWT bound to the **same** `session_id`, so chat history and memory are shared.

## Endpoints

- `POST /api/v1/pair/start` (Bearer JWT) → `{ code, expires_in, lan_url }`
- `POST /api/v1/pair/claim` `{ code }` → `{ authorized, token }`

The code is 6 digits, single-use, and expires after 5 minutes.

## Desktop UI: `/pair`

After signing in with an invite code, open `http://127.0.0.1:3000/pair`. The page calls `/pair/start`, renders a QR code containing the LAN URL (`http://<LAN-IP>:8000/control?code=123456`), and shows the digits in case the QR can't be scanned.

## Phone UI: `/control`

The mobile-first chat. The phone reaches it via the QR-encoded URL (or by browsing manually and entering the code). On claim, the phone stores the JWT in `sessionStorage` and is then a full chat client against the shared session.

## Required server-side setup

For a phone on the same WiFi to reach the desktop's backend, the backend must bind beyond loopback:

```env
BIND_MODE=lan
CORS_ALLOW_ORIGINS=http://127.0.0.1:3000,http://<your-lan-ip>:3000
HEALTH_ALLOWED_CIDRS=127.0.0.0/8,192.168.0.0/16
```

The backend logs a warning at startup when `BIND_MODE=lan` — that's intentional, so you can't accidentally expose it.

## Use cases

- **One person, two devices.** Run hidden on your laptop, send messages from your phone in a meeting.
- **Same session across two desktops.** Pair from machine B; both share memory. Combine with a tunnel (see [`remote-deployment.md`](remote-deployment.md)) to do this across networks.
- **Hand off to a teammate.** Generate a code on demand, share it out-of-band, claim from their device.

## Threat model

- Codes are 6 digits — 1 in 1,000,000 guess chance. Single-use + 5-minute expiry + the existing `/auth/invite` rate-limit make brute force impractical.
- Once paired, the device holds a JWT with the **same session memory access** as the originator. Treat the code like a one-time password.
- Pairing does **not** bypass the invite-only gate. The first device still needs a valid invite to call `/pair/start`.
