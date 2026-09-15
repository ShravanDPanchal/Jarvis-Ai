@echo off
title Jarvis AI Assistant — Setup
color 0A
echo.
echo  ============================================
echo   JARVIS AI ASSISTANT — INSTALLING PACKAGES
echo  ============================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found!
    echo  Please download from https://python.org
    echo  Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

echo  [1/3] Upgrading pip...
python -m pip install --upgrade pip --quiet

echo  [2/3] Installing all required packages...
python -m pip install -r requirements.txt --quiet

echo  [3/3] Done!
echo.
echo  ============================================
echo   SETUP COMPLETE!
echo  ============================================
echo.
echo  NEXT STEP:
echo  Open config.py and paste your DeepSeek API key.
echo  Get one free at: https://platform.deepseek.com/
echo.
echo  Then run:  python jarvis.py
echo.
pause
