@echo off
REM Coffee POS - double-click to start. Keep this window open while the shop is open.
REM To change the admin PIN, edit the next line.
set ADMIN_PIN=1234
cd /d "%~dp0"
node server.js
pause
