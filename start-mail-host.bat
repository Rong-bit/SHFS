@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title SHFS Mail Host
echo ========================================
echo   SHFS mail host (Node / npm)
echo ========================================
echo.
echo Keep this window open.
echo After start, Node prints the real URLs:
echo   This PC:  http://localhost:3000
echo   LAN:      http://192.168.x.x:3000  (actual IP shown)
echo Do NOT use github.io for sending mail.
echo Leave "notify API base URL" empty.
echo.

if not exist "%~dp0package.json" (
  echo [ERROR] package.json not found.
  echo Put this bat in the project root (same folder as package.json).
  echo Run: git pull
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Install LTS from https://nodejs.org/
  echo Then open a NEW command window and try again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found.
  echo Reinstall Node.js LTS from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Node version:
node -v
npm -v
echo.

if not exist "%~dp0node_modules\" (
  echo First run: npm install ...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo Building: npm run build ...
call npm.cmd run build
if errorlevel 1 (
  echo [ERROR] build failed. Copy the error text above.
  pause
  exit /b 1
)

echo.
echo Build OK. Starting server...
echo Browser: http://localhost:3000
echo.
start "" "http://localhost:3000"
call npm.cmd start
set EXITCODE=%errorlevel%
echo.
if not "%EXITCODE%"=="0" (
  echo [ERROR] server exited with code %EXITCODE%
) else (
  echo Server stopped.
)
pause
endlocal & exit /b %EXITCODE%
