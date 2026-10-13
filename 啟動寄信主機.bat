@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM 優先用 py 啟動器，其次 python
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 "%~dp0啟動寄信主機.py"
  goto :end
)

where python >nul 2>&1
if %errorlevel%==0 (
  python "%~dp0啟動寄信主機.py"
  goto :end
)

where python3 >nul 2>&1
if %errorlevel%==0 (
  python3 "%~dp0啟動寄信主機.py"
  goto :end
)

echo [錯誤] 找不到 Python。請先安裝 https://www.python.org/downloads/
echo 安裝時請勾選「Add python.exe to PATH」
pause
exit /b 1

:end
if errorlevel 1 pause
