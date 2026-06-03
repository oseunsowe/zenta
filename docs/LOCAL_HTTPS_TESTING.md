# Local HTTPS testing (XAMPP Apache reverse proxy)

Screen sharing (`getDisplayMedia`), camera and mic are only allowed by browsers
on **`localhost`** or **HTTPS**. To test screen share across devices (phone +
PC) we put XAMPP's Apache in front of the dev servers as an HTTPS reverse proxy.

```
Browser (https://<host>:8443)
        |  TLS
        v
Apache :8443  --/api, /api/v1/ws--> FastAPI 127.0.0.1:8000
              --everything else---> Next.js 127.0.0.1:3000
```

One secure origin means **no CORS and no hardcoded IPs** — the frontend talks to
its own origin and Apache routes server-side.

## One-time setup (already done)

- Cert: `C:\xampp\apache\conf\zenta\zenta.crt|key` — self-signed, SAN covers
  `localhost`, the hostname, and `192.168.18.2`–`.30`. Regenerate from
  `conf\zenta\san.cnf` if your subnet changes (see bottom).
- Apache: `conf\extra\httpd-zenta.conf` (the `:8443` vhost), enabled via an
  `Include` in `httpd.conf`; modules `proxy_http` + `proxy_wstunnel` turned on.
- Firewall: inbound TCP **8443** allowed on Private networks. Re-add anytime by
  running `allow-firewall.bat` as Administrator.

## Every time you want to test

1. Start **Apache** from the XAMPP Control Panel (loads the `:8443` vhost).
2. Double-click **`start-https.bat`** in the repo root. It:
   - frees ports 3000/8000,
   - starts the backend on `127.0.0.1:8000`,
   - starts the frontend with an **empty** `NEXT_PUBLIC_API_BASE_URL` (this is
     what makes it same-origin — do not open `:3000` directly in this mode),
   - prints the exact phone URL using your **current** LAN IP.

Open on this PC: `https://localhost:8443`
Open on your phone (same WiFi): `https://<LAN-IP>:8443` (the script prints it).

The self-signed cert triggers a one-time browser warning →
Chrome/Edge: **Advanced → Proceed**; Firefox: **Advanced → Accept the Risk**;
iOS Safari: tap **Show Details → visit this website**.

## Screen-share test flow

- Viewer device opens `/view` (or `/pair`) and gets a 6-digit code.
- Sharer device opens `/share`, enters the code, clicks **Start sharing**.
- Login/invite codes for testing: `DEMO-1`, `DEMO-2`, `DEMO-3`.

## Notes / gotchas

- **DHCP changes your IP.** The cert covers `.2`–`.30` so most reassignments
  still work; `start-https.bat` always prints the current IP. If your router
  hands out something outside that range, add it to `san.cnf` and regenerate.
- Backend stays on loopback; only Apache is exposed on the LAN — keeps the app
  off the network surface except through the proxy.
- The old `start-dev.bat` (plain HTTP, `:3000` direct) still works for quick
  single-PC checks, but screen share there only works at `127.0.0.1`.

## Regenerate the cert (if subnet/hostname changes)

```bat
cd C:\xampp\apache\conf\zenta
REM edit san.cnf IP entries first if needed
..\..\bin\openssl.exe req -x509 -nodes -newkey rsa:2048 ^
  -keyout zenta.key -out zenta.crt -days 825 -config san.cnf
REM then restart Apache from the XAMPP Control Panel
```
