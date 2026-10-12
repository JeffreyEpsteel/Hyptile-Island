@echo off
rem Hyptile Island: host a universe on this PC.
rem   The game:      http://<this PC>:5190/
rem   The universe:  <this PC>:8765   (Multiplayer > Universe in the game's menu)
rem   Saves:         server-data\hyptile\   (daily copies in server-data\hyptile\backups\)
rem Needs Node 22 (https://nodejs.org) and the node_modules folder next to server\ (a release ships it; the repository: npm install).
rem The server runs on Colyseus; game and server must come from the same release.
rem Type help in this window for the admin commands; stop saves and quits.
rem Another universe name: HOST_UNIVERSE.cmd --universe myisland      More options: HOST_UNIVERSE.cmd --help
rem See docs\HOSTING.md for friends outside your home network.
title Hyptile Island universe
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
	echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
	pause
	exit /b 1
)
node "%~dp0serve-universe.mjs" %*
if errorlevel 1 pause
