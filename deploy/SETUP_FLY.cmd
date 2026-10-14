@echo off
rem One-time setup of the shared Hyptile Island universe on Fly.io: account, app, volume, admin token, first deploy and
rem the GitHub secret FLY_API_TOKEN. Safe to run again (finished steps are skipped). See docs\HOSTING.md.
title Hyptile Island universe: Fly.io setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-fly.ps1"
pause
