@echo off
REM 優先用不需 Python 的啟動方式（校內電腦較穩）
cd /d "%~dp0"
call "%~dp0start-mail-host.bat"
