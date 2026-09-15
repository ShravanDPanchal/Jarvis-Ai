@echo off
title Jarvis Backend Server
set "PATH=C:\Users\Administrator\AppData\Local\Programs\Python\Python313;C:\Users\Administrator\AppData\Local\Programs\Python\Python313\Scripts;%PATH%"
cd /d "%~dp0backend"
python server.py
pause
