# 回檔雷達（huidang-radar）

台股回檔追蹤 PWA — 快速查看自選股**距 3 年高點的回檔幅度**與**下一個關鍵關卡價位**。手機優先、深色看盤風格、可安裝至主畫面、可離線。

## 線上網址

**https://huidang-radar.vercel.app**

GitHub `lighthola/huidang-radar` → Vercel 自動部署（push 到 `main` 自動上線）。

## 功能概覽

- 自選清單：搜尋台股（上市／上櫃，約 2,370 檔含 ETF，中文名）並加入，無上限
- 每檔顯示 3 年高點、現價、回檔幅度、下一關卡價位
- 即時報價（證交所 MIS，盤中每 5 分鐘批次刷新；切回前景自動補刷）
- 長按拖曳排序、左滑刪除、下拉更新
- 分享個股卡片為圖片

## 技術棧

Vue 3（`<script setup>`）+ Vite 5 + vite-plugin-pwa。無後端，資料經 `/api/*` proxy 取自 Yahoo Finance（3 年高點）、證交所 MIS（即時報價）、證交所／櫃買 OpenAPI（官方清單）。狀態存於 localStorage。
