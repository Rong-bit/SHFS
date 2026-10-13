@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Log file helps when the window closes too fast
set "LOG=%~dp0start-mail-host.log"
echo ===== SHFS mail host %DATE% %TIME% =====> "%LOG%"
call :log "Working directory: %CD%"

title SHFS Mail Host
echo ========================================
echo   SHFS mail host (Node / npm)
echo ========================================
echo.
echo A log file will be written:
echo   start-mail-host.log
echo.
echo Keep this window open.
echo After start, open: http://localhost:3000
echo.

if not exist "%~dp0package.json" (
  call :fail "package.json not found. Put this file in the SHFS project root, then run: git pull"
)

REM Prefer node/npm on PATH; also try default install folder
set "NODE_EXE="
set "NPM_CMD="
where node >nul 2>&1 && set "NODE_EXE=node"
where npm >nul 2>&1 && set "NPM_CMD=npm.cmd"

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" (
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
)
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
  set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
  set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
  set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"
)

if not defined NODE_EXE (
  call :fail "Node.js not found. Install LTS from https://nodejs.org/ then REBOOT or open a NEW cmd window."
)
if not defined NPM_CMD (
  if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
)
if not defined NPM_CMD set "NPM_CMD=npm.cmd"

call :log "Using node: %NODE_EXE%"
call :log "Using npm: %NPM_CMD%"
echo Node version:
"%NODE_EXE%" -v
echo npm version:
call "%NPM_CMD%" -v
echo.
"%NODE_EXE%" -v >> "%LOG%" 2>&1
call "%NPM_CMD%" -v >> "%LOG%" 2>&1

if not exist "%~dp0node_modules\" (
  echo First run: npm install ...
  call :log "npm install"
  call "%NPM_CMD%" install >> "%LOG%" 2>&1
  if errorlevel 1 call :fail "npm install failed. See start-mail-host.log"
  echo.
)

echo Building: npm run build ...
call :log "npm run build"
call "%NPM_CMD%" run build >> "%LOG%" 2>&1
if errorlevel 1 (
  echo.
  echo [ERROR] build failed. Last lines of log:
  echo ----------------------------------------
  powershell -NoProfile -Command "Get-Content -Path '%LOG%' -Tail 40"
  echo ----------------------------------------
  call :fail "npm run build failed. See start-mail-host.log"
)

echo.
echo Build OK. Starting server...
echo Open browser: http://localhost:3000
echo.
call :log "npm start"
start "" "http://localhost:3000"
call "%NPM_CMD%" start
set EXITCODE=%errorlevel%
echo.
if not "%EXITCODE%"=="0" (
  echo [ERROR] server exited with code %EXITCODE%
  call :log "server exit %EXITCODE%"
) else (
  echo Server stopped.
  call :log "server stopped ok"
)
echo.
echo Log saved to start-mail-host.log
pause
endlocal & exit /b %EXITCODE%

:log
echo %~1>> "%LOG%"
goto :eof

:fail
echo.
echo [ERROR] %~1
echo %~1>> "%LOG%"
echo.
echo Log file: %LOG%
echo.
echo Manual commands (open cmd in this folder):
echo   node -v
echo   npm -v
echo   npm install
echo   npm run build
echo   npm start
echo.
pause
exit /b 1
