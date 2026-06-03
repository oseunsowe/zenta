@echo off
REM Dev launcher. Default = loopback only (works without firewall).
REM Pass LAN as an argument to expose on LAN for phone/other-PC access:
REM   start-dev.bat LAN

setlocal

set "API_HOST=127.0.0.1"
set "FE_HOST=127.0.0.1"

if /I "%1"=="LAN" (
  for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4 Address.*: 192\." /C:"IPv4 Address.*: 10\." /C:"IPv4 Address.*: 172\."') do (
    if not defined LAN_IP set "LAN_IP=%%a"
  )
  set "LAN_IP=%LAN_IP: =%"
  if "%LAN_IP%"=="" set "LAN_IP=127.0.0.1"
  set "API_HOST=%LAN_IP%"
  set "FE_HOST=0.0.0.0"
)

echo.
echo  Dev launcher
echo  -------------
echo  Mode:           %1
echo  Frontend talks to: http://%API_HOST%:8000
echo  Frontend bound to: %FE_HOST%:3000
echo.
echo  URLs to use:
echo    Login:    http://127.0.0.1:3000
echo    Pair:     http://127.0.0.1:3000/pair
echo    View:     http://127.0.0.1:3000/view
echo.
echo  Demo invite codes: DEMO-1 DEMO-2 DEMO-3
echo.

REM Kill any stale instances that would block ports 8000 / 3000.
taskkill /F /IM "Workspace Helper.exe" >nul 2>&1
taskkill /F /IM "backend-runner.exe" >nul 2>&1
taskkill /F /IM "Echoface Stealth.exe" >nul 2>&1

start "Zenta backend"  cmd /k "cd /d %~dp0backend && py -3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
start "Zenta frontend" cmd /k "cd /d %~dp0frontend && set NEXT_PUBLIC_API_BASE_URL=http://%API_HOST%:8000 && npm run dev -- --hostname %FE_HOST%"

endlocal
