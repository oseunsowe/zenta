@echo off
REM Run this ONCE as Administrator (right-click -> Run as administrator).
REM Opens inbound TCP 8443 on Private networks so phones/other devices on your
REM WiFi can reach the Zenta HTTPS proxy. Loopback (this PC) never needs it.

netsh advfirewall firewall delete rule name="Zenta HTTPS 8443" >nul 2>&1
netsh advfirewall firewall add rule name="Zenta HTTPS 8443" dir=in action=allow protocol=TCP localport=8443 profile=private

echo.
echo Done. Inbound TCP 8443 is now allowed on Private networks.
pause
