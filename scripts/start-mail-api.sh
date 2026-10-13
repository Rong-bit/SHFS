#!/usr/bin/env bash
# 校內常開電腦：建置並啟動含 SMTP 寄信 API 的 Node 服務
set -euo pipefail
cd "$(dirname "$0")/.."

echo "========================================"
echo "  SHFS 巡堂寄信服務（校內主機）"
echo "========================================"
echo "操作時請開 http://這台IP:3000（不要開 github.io）"
echo "寄信 API 根網址請留空"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "[錯誤] 找不到 npm，請先安裝 Node.js"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "首次執行：npm install ..."
  npm install
fi

npm run build
echo
echo "請用瀏覽器開啟 http://localhost:3000"
echo
npm start
