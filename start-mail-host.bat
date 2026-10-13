@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

title SHFS 巡堂寄信主機
echo ========================================
echo   SHFS 巡堂寄信主機（不需 Python）
echo ========================================
echo.
echo 請保持本視窗開啟。
echo 啟動後請開：http://localhost:3000
echo 其他電腦開：http://這台區網IP:3000
echo （不要開 github.io；寄信 API 根網址請留空）
echo.

if not exist "%~dp0package.json" (
  echo [錯誤] 找不到 package.json
  echo 請確認此 bat 放在專案根目錄（與 package.json 同層），
  echo 且已用 git clone / git pull 下載完整專案，不是只下載單一檔案。
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [錯誤] 找不到 Node.js
  echo 請先安裝：https://nodejs.org/  （選 LTS）
  echo 安裝後重新開啟此視窗再試。
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [錯誤] 找不到 npm（通常隨 Node.js 安裝）
  echo.
  pause
  exit /b 1
)

echo Node 版本：
node -v
npm -v
echo.

if not exist "%~dp0node_modules\" (
  echo 首次執行：npm install ...
  call npm install
  if errorlevel 1 (
    echo [錯誤] npm install 失敗
    pause
    exit /b 1
  )
  echo.
)

echo 正在建置 npm run build ...
call npm run build
if errorlevel 1 (
  echo [錯誤] 建置失敗。請把上方紅色錯誤訊息截圖給管理員。
  pause
  exit /b 1
)

echo.
echo 建置完成，正在啟動...
echo 瀏覽器將開啟 http://localhost:3000
echo 若未自動開啟，請手動輸入網址。
echo.
start "" "http://localhost:3000"
call npm start
set EXITCODE=%errorlevel%
echo.
if not "%EXITCODE%"=="0" (
  echo [錯誤] 服務異常結束（代碼 %EXITCODE%）
) else (
  echo 服務已結束。
)
pause
endlocal & exit /b %EXITCODE%
