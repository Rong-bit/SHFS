@echo off
REM Opens a command window in the project folder so you can type commands manually.
cd /d "%~dp0"
echo Project folder:
echo %CD%
echo.
echo Try these commands one by one:
echo   node -v
echo   npm -v
echo   npm install
echo   npm run build
echo   npm start
echo.
echo Then open browser: http://localhost:3000
echo.
cmd /k
