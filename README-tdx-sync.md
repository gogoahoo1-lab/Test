# TDX 航班同步 · GitHub Actions 集中式架構

## 為什麼這樣做

你的多個 App（貴賓室、即時航班看板等）都需要 TDX 資料。
與其每個 App 各自打 TDX（一天累積下來很容易超過 TDX 免費層限制），
不如**用 GitHub Actions 集中同步一次**，所有 App 從 GitHub 讀。

```
   ┌──────────────────────────┐
   │  GitHub Actions (cron)   │  ← 每 30 分鐘打一次 TDX
   │  .github/workflows/…yml  │
   └──────────┬───────────────┘
              ▼
   ┌──────────────────────────┐
   │  data/flights.json       │  ← 存在 gogoahoo1-lab.github.io repo
   │  (透過 GitHub Pages 公開) │
   └──────────┬───────────────┘
              ▼
   ┌──────────────────────────────────────┐
   │  貴賓室 APP / 航班看板 / 其他 App     │
   │  fetch(gogoahoo1-lab.github.io/…)    │
   └──────────────────────────────────────┘
```

## GitHub owner / repo 可以隨時改

前端裡有一個 ⚙️ 按鈕（客量預估頁右上角），點下去會用兩個 `prompt` 讓你輸入：
1. GitHub owner（帳號）
2. Repo 名稱（`<owner>.github.io` 表示是 user page；其他名字就是 project repo）

存在瀏覽器 localStorage：
- `tdx_github_owner`
- `tdx_github_repo`

程式會自動組出兩個 URL：
- `https://<owner>.github.io/data/flights.json`（user page 時）
- `https://<owner>.github.io/<repo>/data/flights.json`（project page 時）
- `https://github.com/<owner>/<repo>/actions/workflows/sync-tdx-flights.yml`

沒設過就用預設值 `gogoahoo1-lab` / `gogoahoo1-lab.github.io`。

> **提醒**：這是 per-browser 設定 — 每個裝置第一次用會看到預設值，需要按 ⚙️ 設一次。
> 若團隊多台裝置需要共用，之後可把它搬到 Supabase `app_settings` 表。

## 部署步驟

### 1. 到 repo 根目錄放這兩個檔案

```
gogoahoo1-lab.github.io/
├── .github/
│   ├── workflows/
│   │   └── sync-tdx-flights.yml       ← 這個檔（附件）
│   └── scripts/
│       └── sync-tdx-flights.js        ← 這個檔（附件）
├── data/
│   └── flights.json                   ← Actions 會自動產生，你不用建
└── index.html                         ← 你的貴賓室 App
```

### 2. 到 repo Settings → Secrets and variables → Actions → New repository secret

新增兩個 secret：

| Name | Value |
|---|---|
| `TDX_CLIENT_ID` | 你在 tdx.transportdata.tw 申請的 client id |
| `TDX_CLIENT_SECRET` | 對應的 client secret |

（免費申請 https://tdx.transportdata.tw/ 註冊帳號 → API 平台 → 建立 App）

### 3. 允許 GitHub Actions 寫回 repo

Repo Settings → Actions → General → 底下 **Workflow permissions** → 勾選 **Read and write permissions** → Save

（不然 Actions 沒權限 commit `data/flights.json` 回 main）

### 4. 第一次手動觸發

到 repo 的 **Actions** 分頁 → 左邊選 **Sync TDX Flights** → 右邊 **Run workflow** → 綠色按鈕

觀察 log：
- ✓ Got access token
- ✓ TDX returned 42 rows
- ✓ Kept 42 unique JX flights
- ✓ Wrote data/flights.json (42 flights)
- ✓ Committed new flights.json

第一次成功後就會每 30 分鐘自動跑一次。

### 5. 確認資料

打開 `https://gogoahoo1-lab.github.io/data/flights.json` 應該看到：

```json
{
  "last_updated": "2026-09-20T10:15:00.000Z",
  "source": "TDX FIDS TPE Departure (AirlineID=JX)",
  "count": 42,
  "flights": [
    {
      "flight_no": "JX121",
      "destination": "HKG",
      "destination_name": "香港",
      "std": "09:55",
      "terminal": "T1",
      ...
    },
    ...
  ]
}
```

### 6. 貴賓室 App 什麼都不用改

新版 `index.html` 已經改成從這個 URL 讀 —— F5 就好。

## 使用方式

### 平時（自動）
- 每 30 分鐘 GitHub Actions 自動 sync 一次
- App 開啟時或進「客量預估」頁時，會 fetch 最新的 `flights.json`
- 「客量預估」頁右上角顯示 `TDX 同步：15 分鐘前` 之類的狀態

### 要即時（手動）
右上角有兩個按鈕：

- **🔄** — 純前端動作，重新抓 `flights.json`（若 5 分鐘前 Actions 剛跑完，這樣就拿到最新）
- **⚡** — 開啟 GitHub Actions 頁面，你按 **Run workflow** 觸發一次即時 sync（30 秒左右完成）→ 完成後再按 🔄

## 修改 cron 頻率

在 `sync-tdx-flights.yml` 中：

```yaml
- cron: '*/30 * * * *'   # 每 30 分鐘（預設）
```

改成：
- `'0 * * * *'` — 每小時
- `'*/15 * * * *'` — 每 15 分鐘（會用比較多 TDX 額度）
- `'0 6,10,14,18,22 * * *'` — 每天 6/10/14/18/22 點固定跑 5 次

## 除錯

**Actions 跑失敗**
- 到 Actions 分頁看紅色叉叉那次的 log
- 常見錯誤：
  - `Missing TDX_CLIENT_ID`：Secret 沒設或名字打錯
  - `TDX auth failed: 400`：Client id / secret 錯，或帳號被停用
  - `TDX FIDS failed: 429`：TDX 額度用光（多半是你別的 App 也在打）

**flights.json 沒更新**
- Actions 有跑成功但沒 commit：通常是 TDX 回傳的資料跟上次一樣（沒改變不 commit）
- Actions 沒跑：cron 有時延遲 5-15 分鐘正常，超過就檢查 Actions 頁面

**貴賓室 App 顯示「TDX 同步：未知」**
- `flights.json` 還沒生成 → 到 Actions 手動觸發第一次
- 或 URL 不對 → 檢查 `GITHUB_FLIGHTS_URL` 是否指向你的 GitHub Pages

## 其他 App 怎麼用

任何你的 App 都可以這樣讀：

```js
const resp = await fetch('https://gogoahoo1-lab.github.io/data/flights.json');
const { flights, last_updated } = await resp.json();
```

不用申請自己的 TDX 帳號，也不會撞 rate limit。
