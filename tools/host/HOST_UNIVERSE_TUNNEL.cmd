@echo off
rem Hyptile Island: host a universe on this PC and open it to the internet (Cloudflare quick tunnel: no account, no
rem port forwarding). It prints an https://....trycloudflare.com address: players paste it into Multiplayer > Universe
rem of the game at https://jeffreyepsteel.github.io/Hyptile-Island/ . The address changes each start; keep this
rem window open while people play. Saves: server-data\hyptile\ . Needs Node 22 (https://nodejs.org).
title Hyptile Island universe (tunnel)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
	echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
	pause
	exit /b 1
)
node "%~dp0tunnel.mjs" %*
if errorlevel 1 pause
