@echo off
REM ===========================================================================
REM  Zenta - start & test the WEB version
REM
REM  Launches the full local stack on ONE secure origin so every feature works,
REM  including screen sharing across devices (phones/other PCs on your Wi-Fi):
REM
REM     Browser (https://<host>:8443)
REM            |  TLS (XAMPP Apache reverse proxy)
REM            +--> Next.js frontend  127.0.0.1:3000
REM            +--> FastAPI backend   127.0.0.1:8000   (/api, /api/v1/ws)
REM
REM  Use the https://...:8443 URLs below. Do NOT open http://127.0.0.1:3000
REM  directly - in this mode the UI is same-origin and has no API on :3000.
REM
REM  First time only: run allow-firewall.bat as Administrator (opens port 8443
REM  so phones/other devices on your Wi-Fi can reach it).
REM ===========================================================================

setlocal enabledelayedexpansion

REM --- Detect current LAN IP (DHCP changes it, so never hardcode) ---
set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*'} | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LAN_IP=%%i"
if "%LAN_IP%"=="" set "LAN_IP=127.0.0.1"

echo.
echo  ==========================================================
echo   Zenta - web version
echo  ==========================================================
echo   Open on THIS PC :  https://localhost:8443
echo   Open on a PHONE :  https://%LAN_IP%:8443   (same Wi-Fi)
echo.
echo   Pages:   /login   /  (home)   /requests   /account
echo.
echo   Test accounts:
echo     tester1 / password123
echo     alice   / DemoAlice1
echo     bob     / DemoBob1234
echo   New account needs an invite code: DEMO-1  DEMO-2  DEMO-3
echo.
echo   Screen-share test (two windows on one PC):
echo     1) Window A (normal)    -> login as alice -> Connect -> enter "bob"
echo     2) Window B (incognito) -> login as bob   -> Accept ^& share
echo     3) Pick a screen/window -> Alice sees Bob's screen
echo.
echo   A self-signed cert warning appears once -> Advanced -> Proceed.
echo  ==========================================================
echo.

REM --- Free ports 8000 (backend) and 3000 (frontend) if already in use ---
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1

REM --- Backend on loopback (Apache reaches it locally) ---
start "Zenta backend" cmd /k "cd /d %~dp0backend && py -3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

REM --- Frontend on loopback, EMPTY api base => same-origin through the proxy ---
start "Zenta frontend" cmd /k "cd /d %~dp0frontend && set NEXT_PUBLIC_API_BASE_URL=&& npm run dev -- --hostname 127.0.0.1 --port 3000"

REM --- Apache HTTPS reverse proxy on :8443 ---
REM Reuse Apache if it's already running (e.g. from the XAMPP Control Panel);
REM otherwise start a standalone instance here.
netstat -ano | findstr /R /C:":8443 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo  Starting Apache HTTPS proxy on 8443...
  start "Zenta Apache" cmd /k ""C:\xampp\apache\bin\httpd.exe" -D FOREGROUND"
) else (
  echo  Apache already running on 8443 - reusing it.
)

echo.
echo  Backend + frontend starting in their own windows. Give it ~15s, then open
echo  https://localhost:8443  in your browser. Keep these windows open.
echo  (If you ever see HTTP 503, the backend window was closed - re-run this file.)
echo.
endlocal
