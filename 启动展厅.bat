@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

if not defined PORT set PORT=5173

where node >nul 2>nul
if errorlevel 1 goto nolib

echo [FORMA] Starting local server on port %PORT% ...
start "" /b node serve.mjs

set /a tries=0
:wait
timeout /t 1 /nobreak >nul
curl -s --noproxy "*" -o nul http://127.0.0.1:%PORT%/
if errorlevel 1 goto retry
goto ready
:retry
set /a tries+=1
if !tries! lss 15 goto wait

:ready
start "" http://127.0.0.1:%PORT%/
echo.
echo [FORMA] Showcase is running: http://127.0.0.1:%PORT%/
echo [FORMA] Close this window to stop the server.
echo.
pause >nul
exit /b 0

:nolib
echo [FORMA] Node.js was not found in PATH.
echo [FORMA] Install Node.js LTS from https://nodejs.org and double-click this file again.
pause
exit /b 1
