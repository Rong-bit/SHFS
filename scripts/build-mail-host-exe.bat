@echo off
chcp 65001 >nul
cd /d "%~dp0.."

echo 將「啟動寄信主機.py」打包成 Windows 執行檔（需已安裝 Python）
echo.

where py >nul 2>&1 && set PY=py -3
if not defined PY where python >nul 2>&1 && set PY=python
if not defined PY (
  echo [錯誤] 找不到 Python
  pause
  exit /b 1
)

%PY% -m pip install --upgrade pyinstaller
%PY% -m PyInstaller --noconfirm --clean --onefile --console --name "啟動寄信主機" "啟動寄信主機.py"

echo.
echo 完成後執行檔在：dist\啟動寄信主機.exe
echo 請把 exe 放在專案根目錄（與 package.json 同層）再執行。
pause
