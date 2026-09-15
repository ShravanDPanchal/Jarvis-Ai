@echo off
title Jarvis Frontend HUD
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0frontend"
npm run dev
pause
