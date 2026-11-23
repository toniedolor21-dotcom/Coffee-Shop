@echo off
REM Coffee POS - double-click to start. Keep this window open while the shop is open.
REM To change the admin PIN, edit the next line.
set ADMIN_PIN=1234
REM Optional AI assistant: you can also set the key in Products & prices > AI assistant.
REM set OPENAI_API_KEY=sk-your-key-here
cd /d "%~dp0"
node server.js
pause
