# Retail Sales Driver

美國零售銷售的細項金額與貢獻度拆解。資料來自 Census 的 Advance Monthly Retail Trade Survey（MARTS），季節調整、月資料，1992 年起。

GitHub Actions 每個工作日自動向 Census 下載最新資料，有新資料時重新產生網站。不需要自己的伺服器，也不需要 API key。

## 網站功能

- **指標**：總計、不含汽車、不含加油站、不含汽車與加油站、控制組、自訂。
  - 前四個是 Census 公布的序列（44X72、44Y72、44Z72、44W72）。
  - 控制組 Census 沒有公布，依市場慣例自行計算：總計扣除汽車及零件經銷商（441）、加油站（447）、建材及園藝設備（444）、餐飲服務（722）。
  - 所有特殊分類都由「控制組＋汽車、加油站、建材、餐飲」五塊組成（顏色固定）。點控制組可以展開成 9 個細項；汽車、食品飲料、綜合商品也能再往下展開。
- **圖表**：
  - 金額：季調銷售額堆疊圖，單位億美元。
  - 年增率貢獻、月增率貢獻：一律是「對整體零售的貢獻」，單位百分點，各項加總就是整體零售的變動率。年增率用季調數字計算，和 Census 新聞稿一致。
- **期間**：12 個月、24 個月、5 年、全部（1992 年起），或自訂起訖月份。
- **自訂組合**：從樹狀清單挑最多 9 項疊成柱狀圖，可搜尋中文、英文或 NAICS 代碼。
  - 內容重疊的項目不能同時選，例如控制組和它底下的家具店。
  - 以整體零售為基準，其餘項目併成灰色「其他」。打開「只看所選項目」就不畫「其他」，總計線改為所選項目合計。
  - 選擇會記在瀏覽器裡。
- **組合圖**（自訂組合裡切換「貢獻拆解／組合圖」）：把不同項目的金額、年增率、月增率畫在同一張圖。
  - 每條序列各自選項目、數值種類（金額、年增率、月增率）、畫成柱或線、放左軸或右軸，最多 9 條。
  - 同一項目可以同時加入多種數值（例如總計的金額與年增率）。項目之間可以重疊（例如總計與控制組），因為這裡不做加總。
  - 新增時預設：金額是左軸柱子，變動率是右軸折線。只用到一個軸時一律畫在左邊。
  - 同一軸同時放金額與變動率時會提醒，因為單位不同。
  - 雙軸時，右軸自動用和左軸一樣多的刻度間隔，兩軸格線重合。
  - 多條柱子在同一個月並排，依清單順序由左到右。
  - 有四個範例可以一鍵套用，設定會記在瀏覽器裡。
  - 下載 PNG、CSV 都支援組合圖；PNG 的左右軸範圍可以分別手動設定。
- **初值標示**：最新一個月是初值，圖上用較淡的顏色標示，下個月會修正。
- **隱藏項目**：點圖例可以隱藏某一項，它會併入灰色「其他」，柱子加總不變。金額圖的總計線就是柱子頂端，預設不畫，可從圖例打開。
- **下載圖表（PNG）**：
  - 兩種尺寸：半欄 8.5 × 5.2 公分（報告左右並排的圖框）、整欄 16 × 9 公分（A4 版心寬度），都是 300 dpi，插入 Word 時自動是設定的尺寸。
  - 可以改圖例文字、顏色、字體大小（自動、6–12 點或 14 點）。
  - 顏色只能從預設色票選：公司 9 色、灰色、黑色。
  - 圖例可以靠左或置中。
  - 總計線（黑線）可以選實線或虛線，粗細 0.75–3 點，預設 1.5 點實線。
  - 可以手動設 y 軸上下限，超出的部分會截掉。金額、年增、月增分開記，重新整理後恢復自動。
  - 要改尺寸，修改 `site/app.js` 裡的 `PRESETS`。
- **下載資料 CSV**：目前這張圖的數字，包含所有子項（不受圖例隱藏影響）、總計線，以及貢獻圖所屬項目的自身變動率。用 Excel 直接開啟即可，最新月份會在備註欄標「初值」。
- **配色**：依位置使用公司 9 色（#156082、#E97132、#196B24、#0F9ED5、#A02B93、#4EA72E、#00897B、#FF8080、#C8102E），與 PCE Driver 相同。

## 檔案說明

| 路徑 | 用途 |
|---|---|
| `.github/workflows/update.yml` | 排程：抓資料、檢查、部署網站 |
| `pipeline/build_data.py` | 產生資料檔的主程式（含所有檢查） |
| `pipeline/sources.py` | 下載 Census 整包資料、API 備援、下次發布日期 |
| `pipeline/structure.json` | 類別清單、樹狀結構、中文名稱、特殊分類 |
| `site/template.html` | 網頁版面與樣式 |
| `site/app.js`、`site/compute.js` | 網頁互動、下載功能與貢獻度計算 |
| `build_site.py` | 把資料與程式嵌入網頁，輸出 `public/index.html` |
| `data/retail.json` | 最新資料（排程會自動更新並 commit） |

## 第一次設定

1. **建立 repository**：登入 GitHub → 右上角「+」→ New repository。名稱填 `retail-sales-driver`，選 **Public**，其他不用勾，按 Create repository。
   免費帳號只有公開的 repository 能架 GitHub Pages 網站。
2. **上傳檔案**：在新 repository 頁面點「uploading an existing file」，把這個資料夾裡的所有內容拖進去，按 Commit changes。
   `.github` 是隱藏資料夾，Mac 的 Finder 預設看不到，要先按 `Cmd + Shift + .` 顯示隱藏檔再一起拖。上傳後確認 repository 裡有 `.github/workflows/update.yml`。
   如果還是漏掉，可以點 Add file → Create new file，檔名輸入 `.github/workflows/update.yml`，再把檔案內容貼上。
3. **開啟網站**：Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
4. **手動跑第一次**：Actions 分頁 → 左側「更新 Retail Sales Driver」→ Run workflow。大約一分鐘，成功後網址是 `https://你的帳號.github.io/retail-sales-driver/`。
5. **（選用）Census API key**：整包下載是主要來源，不需要 key。如果想多一層備援：
   1. 到 <https://api.census.gov/data/key_signup.html> 申請 key。
   2. Settings → Secrets and variables → Actions → New repository secret，Name 填 `CENSUS_API_KEY`。
   3. 之後整包下載失敗時，排程會自動改用 Census Data API。

## 之後的運作

- **更新時間**：每個週一到週五台北時間 22:07 檢查一次（Census 在美東 8:30 發布）。有新資料才 commit 並重新部署，沒有就什麼都不做。
- **重抓完整歷史**：每次都重抓 1992 年以來的完整歷史，所以前兩個月的修正和每年的年度修正都會反映出來。
- **每次更新都會檢查**：
  - Census 的類別清單和 `structure.json` 完全一致。
  - 細項相加等於官方的總計、零售業、不含汽車、不含加油站、不含汽車與加油站，以及汽車、食品飲料、綜合商品。
  - 月份連續、沒有缺值。
  - 任何一項不符就停下來，網站維持上一版。
- **執行失敗時**：GitHub 會寄信通知，錯誤訊息會說明原因。常見的有：
  - **Census 改了類別**：Census 預計 2027 年底前改用 2022 年版 NAICS，屆時會取消無店面零售（454）等類別，排程會列出哪些代碼不同。到時候需要修改 `pipeline/structure.json`（類別清單、最細項目、各彙總節點的組成）後 commit。
  - **連不上 Census 或被擋**：通常隔天會自己恢復。若持續失敗，可以設定上面的 `CENSUS_API_KEY`，或用下面的手動更新。
- **排程被停用**：公開 repository 連續 60 天沒有任何活動，排程會被 GitHub 自動停用。正常情況下每月都有資料 commit，不會碰到；如果 Census 長時間沒有發布（例如政府停擺），到 Actions 頁面按 Enable workflow 即可。
- **修改網頁**：編輯 `site/` 底下的檔案並 commit，會自動重新部署。

## 手動更新（備援）

到 Census 時間序列網站（currentdata）下載 MARTS 整包資料。網址如下，會下載 `MARTS-mf.zip`：

```
https://www.census.gov/econ_getzippedfile/?programCode=MARTS
```

然後執行：

```
python pipeline/build_data.py --zip MARTS-mf.zip --out data/retail.json
python build_site.py data/retail.json public/index.html
```

commit `data/retail.json` 之後，網站會在排程下次執行時更新；也可以到 Actions 頁面手動執行。

zip 裡的 CSV 是「索引格式」：前面是類別、月份等代碼表，數字在檔案最後的 DATA 區段，用 Excel 直接開看不出內容，這是正常的。

## 本機測試

```
python pipeline/build_data.py --out data/retail.json
python build_site.py
```

用瀏覽器打開 `public/index.html`。只需要 Python 3.9 以上，不用安裝其他套件。

## 資料來源

U.S. Census Bureau, Advance Monthly Retail Trade Survey（Advance Monthly Sales for Retail and Food Services）。
