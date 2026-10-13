@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   SHFS 巡堂寄信服務（校內主機）
echo ========================================
echo.
echo 1. 請保持本視窗開啟
echo 2. 操作時請開 http://這台電腦的IP:3000
echo    （不要開 github.io）
echo 3. 寄信設定「寄信 API 根網址」請留空
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo [錯誤] 找不到 npm，請先安裝 Node.js：https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 首次執行：正在 npm install ...
  call npm install
  if errorlevel 1 (
    echo [錯誤] npm install 失敗
    pause
    exit /b 1
  )
)

echo 正在建置...
call npm run build
if errorlevel 1 (
  echo [錯誤] 建置失敗
  pause
  exit /b 1
)

echo.
echo 啟動完成後，請用瀏覽器開啟：
echo   http://localhost:3000
echo 其他電腦請改開：http://這台的區網IP:3000
echo.
start "" "http://localhost:3000"
call npm start
echo.
echo 服務已結束。
pause
