@echo off
REM ===========================================================================
REM  Zenta HTTPS launcher  (cross-device testing via XAMPP Apache reverse proxy)
REM
REM  Serves ONE secure origin so screen sharing (getDisplayMedia) works on the
REM  PC AND on phones / other devices on the same WiFi.
REM
REM  The cert is self-signed -> the browser shows a one-time warning.
REM  Click "Advanced" -> "Proceed" (Chrome) / "Accept the Risk" (Firefox).
REM
REM  Frontend runs with an EMPTY API base on purpose: every request is
REM  same-origin and Apache routes /api + /api/v1/ws to the backend.
REM  (Do NOT open http://127.0.0.1:3000 directly in this mode - use :8443.)
REM
REM  First time only: run allow-firewall.bat as Administrator (opens port 8443).
REM ===========================================================================

setlocal enabledelayedexpansion

REM --- Detect current LAN IP (DHCP changes it, so never hardcode) ---
set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*'} | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LAN_IP=%%i"
if "%LAN_IP%"=="" set "LAN_IP=127.0.0.1"

echo.
echo  Zenta HTTPS launcher
echo  --------------------
echo  This PC:    https://localhost:8443
echo  Phone/LAN:  https://%LAN_IP%:8443
echo    Pair:     https://%LAN_IP%:8443/pair
echo    Share:    https://%LAN_IP%:8443/share
echo    View:     https://%LAN_IP%:8443/view
echo.
echo  Demo invite codes: DEMO-1  DEMO-2  DEMO-3
echo.

REM --- Free ports 8000 (backend) and 3000 (frontend) if already in use ---
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1

REM --- Backend on loopback (Apache reaches it locally) ---
start "Zenta backend" cmd /k "cd /d %~dp0backend && py -3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

REM --- Frontend on loopback, EMPTY api base => same-origin through the proxy ---
start "Zenta frontend" cmd /k "cd /d %~dp0frontend && set NEXT_PUBLIC_API_BASE_URL=&& npm run dev -- --hostname 127.0.0.1 --port 3000"

REM --- Apache HTTPS reverse proxy on :8443 ---
REM If you already started Apache from the XAMPP Control Panel, it is reused.
REM Otherwise we launch a standalone Apache here.
netstat -ano | findstr /R /C:":8443 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo  Apache not detected on 8443 - starting it...
  start "Zenta Apache" cmd /k ""C:\xampp\apache\bin\httpd.exe" -D FOREGROUND"
) else (
  echo  Apache already running on 8443 ^(XAMPP^) - reusing it.
)

echo.
echo  Backend + frontend starting in separate windows.
echo  If you change the Apache config or cert, restart Apache from XAMPP.
echo.
endlocal
