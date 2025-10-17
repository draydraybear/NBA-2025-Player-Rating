# NBA 30 隊資訊小網站（已設定好）

## 如何啟動
1. 安裝 Node.js (LTS)。打開終端輸入 `node -v` 和 `npm -v` 確認有版本。
2. 在此資料夾開終端：
   - Windows (CMD)：`cd /d "<這個資料夾路徑>"`
3. 安裝依賴：`npm install`
4. 開發啟動：`npm run dev`
5. 打開顯示的網址（通常是 http://localhost:5173/ ）

## 檔案重點
- `src/App.jsx`：主要功能（可編輯球員表格、上傳陣容圖、CSV 匯入/匯出、JSON 備份）。
- `tailwind.config.js` + `src/index.css`：已配置 Tailwind。
