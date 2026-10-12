@echo off
rem Hyptile Island: dev server (the game) + the multiplayer relay, then the browser.
rem Needs Node 22 and a browser with WebGPU (Chrome / Edge). First run: npm install
cd /d "%~dp0"
if not exist node_modules (
	echo Installing dependencies...
	call npm install --no-audit --no-fund
)
start "Hyptile Island server" cmd /k npm run server
start "Hyptile Island" cmd /k npm run dev
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:5189/?mp"
echo.
echo Game:   http://127.0.0.1:5189/        (add ?mp to join the local server, ?noAudio to mute)
echo Server: ws://127.0.0.1:8765/island    (health: http://127.0.0.1:8765/health)
echo Close the two console windows to stop.
