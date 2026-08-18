# SHFS 高職專業實習調代課暨鐘點費結算智慧系統

> 專為技術型高級中等學校（高職）設計的專業實習調代課管理、衝堂防呆檢核、代課通知單自動套印與主計出納鐘點費結算一體化系統。

## 🌟 系統特色

- 🛠️ **高職專業實習連堂防呆檢核**：支援 3~4 節實習連堂自動連動，實習工場安全等級與設備配置即時比對。
- ⚡ **AI 智慧排代推薦**：依據同科專長、基本授課節數、空堂時段與超額時數智慧媒合最合適之代課教師。
- 📋 **教學組一鍵核定與通知單套印**：支援教育部標準格式「調課/代課/補課申請單」與「派代通知單」即時列印與匯出。
- 💰 **主計出納結算總表**：自動區分公假派代、私假自費、日夜間鐘點費率，並提供每週超額 9 節預警與 Excel 報表匯出。
- 👥 **教學組名冊彈性維護**：支援一人兼辦全組業務或多人分工，簽章即時同步。
- 🌐 **100% 純前端離線支援**：支援部署於 GitHub Pages，本機資料持久化儲存。

## 🚀 部署至 GitHub Pages

本專案已內建 GitHub Actions 自動部署。請注意：**在 `github.com` 打開儲存庫只會看到原始碼，不會出現系統畫面。** 系統網址是 GitHub Pages 的 `github.io`。

1. 將本專案推送到 GitHub（建議預設分支為 `main` 或 `master`）。
2. 進入儲存庫 **Settings** ➔ **Pages**。
3. 將 **Build and deployment** ➔ **Source** 設為 **GitHub Actions**（不要選「Deploy from a branch」）。
4. 進入 **Actions** 分頁，確認 `Deploy to GitHub Pages` 工作流程為綠色成功。
5. 以 Actions 成功後顯示的網址開啟，格式為：

   `https://<您的帳號>.github.io/<儲存庫名稱>/`

   例如儲存庫名稱為 `SHFS` 時：`https://<您的帳號>.github.io/SHFS/`

若 Actions 失敗，請點開該次執行的紅色紀錄，常見原因是尚未啟用 Pages 的 GitHub Actions 來源。

## 💻 本地端開發 (Local Development)

```bash
# 安裝相依套件
npm install

# 啟動開發伺服器
npm run dev

# 專案打包編譯（含本機 Node 伺服器）
npm run build

# 僅編譯 GitHub Pages 靜態網站
npm run build:pages
```
