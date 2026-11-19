# PCE Driver

美國 PCE 物價的細項貢獻度拆解。依 BEA Table 2.4.4U（價格指數）與 2.4.5U（名目支出）的樹狀結構逐層展開，每一層都顯示對 PCE 總指數年增率、月增率的貢獻。

GitHub Actions 每個工作日自動呼叫 BEA API，有新資料時重新計算並更新網站。

## 網站功能

- **指數**：PCE、核心 PCE（不含食品與能源），以及「通用分類」：把整體 PCE 分成核心商品、服務排除能源、食品與能源三組（對應 BEA line 375、376、370），三組貢獻相加等於整體 PCE。
- **自訂**：自己挑最多 9 個細項疊成柱狀圖（可搜尋中文、英文或 line 編號）。除了商品、服務底下的 BEA 項目，也可以選五個通用分類：食品與能源（line 370）、能源商品與服務（371）、核心 PCE（374）、核心商品（375）、服務排除能源（376），自身漲幅用 BEA 官方彙總序列；內容重疊的項目不能同時選。清單順序就是由下往上疊的順序；選了某一項後，它的上層和下層不能再選，避免重複計算。以整體 PCE 為基準，其餘項目併成灰色「其他」，總計線是 PCE 的實際漲幅；打開「只看所選項目」則不畫「其他」，總計線改為所選項目合計。點色塊會切回 PCE 模式展開那一項。選擇會記在瀏覽器裡。
- **變動**：年增率或月增率。
- **期間**：12 個月、24 個月、全部，或自訂起訖月份。
- **逐層展開**：點圖上的色塊或下方列表往下展開，用麵包屑返回。核心模式下，被剔除部分子項的層級會自動改名，例如「核心商品」、「服務排除能源」。
- **隱藏項目**：點圖例可以隱藏或重新顯示某一項；隱藏的項目會併成灰色的「其他」，柱子加總仍然等於總計線。總計線也能點圖例關閉。每一層分別記住，重新整理網頁後恢復全部顯示。下方列表保持完整，隱藏的項目以淡色顯示。
- **下載圖表**：按「下載圖表」打開下載設定，可以改圖例文字（只用在下載的圖片，網站名稱不變，改過的名稱記在這台電腦的瀏覽器）、選字體大小（自動或 6–12 點），並即時預覽。圖片固定 8.5 × 5.2 公分、300 dpi，圖例在上方，會依字數與字體自動調整圖例與柱狀圖的比例、刻度數量與月份間隔。要改尺寸，修改 `site/template.html` 裡的 `EXPORT = { wcm: 8.5, hcm: 5.2, dpi: 300 }`。
- **下載圖片的顏色與格線**：在下載設定裡點色塊可以改顏色（含灰色「其他」與總計線），只影響下載的圖片；顏色依位置記住，例如第 1 色改了，所有圖的第 1 色都會換，「還原預設顏色」可復原。下載的圖片固定畫上淡灰色橫向格線（#D9D9D9，與 Excel 預設相同）。
- **配色**：依位置使用公司 9 色（#156082、#E97132、#196B24、#0F9ED5、#A02B93、#4EA72E、#00897B、#FF8080、#C8102E）；深色模式把其中 4 色稍微調亮。

## 檔案說明

| 路徑 | 用途 |
|---|---|
| `.github/workflows/update.yml` | 排程：抓資料、計算、部署網站 |
| `pipeline/build_data.py` | 產生資料檔的主程式（API 或 Excel 來源） |
| `pipeline/sources.py` | 呼叫 BEA API、讀取 Excel |
| `pipeline/tree.py` | 建立樹狀結構、整理貢獻度資料 |
| `pipeline/structure.json` | BEA 表格的樹狀結構與中文名稱 |
| `pipeline/make_structure.py` | BEA 改表格時，用新的 Excel 重建結構檔 |
| `site/template.html`、`site/compute.js` | 網頁與貢獻度計算 |
| `build_site.py` | 把資料嵌入網頁，輸出 `public/index.html` |
| `data/pce.json` | 最新資料（排程會自動更新並 commit） |

## 第一次設定

1. **申請 BEA API key**：到 <https://apps.bea.gov/API/signup/> 填姓名與 email，key 會寄到信箱。
2. **建立 repository**：登入 GitHub → 右上角「+」→ New repository。名稱填 `pce-driver`，選 **Public**，其他不用勾，按 Create repository。
   免費帳號只有公開的 repository 能架 GitHub Pages 網站。API key 放在下一步的 Secrets 裡，不會公開。
3. **上傳檔案**：在新 repository 頁面點「uploading an existing file」，把這個資料夾裡的所有內容拖進去，按 Commit changes。
   `.github` 是隱藏資料夾，Mac 的 Finder 預設看不到，要先按 `Cmd + Shift + .` 顯示隱藏檔再一起拖。上傳後確認 repository 裡有 `.github/workflows/update.yml`。
   如果還是漏掉，可以點 Add file → Create new file，檔名輸入 `.github/workflows/update.yml`，再把檔案內容貼上。
4. **存入 API key**：Settings → Secrets and variables → Actions → New repository secret。Name 填 `BEA_API_KEY`，Secret 貼上 key。
5. **開啟網站**：Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
6. **手動跑第一次**：Actions 分頁 → 左側「更新 PCE Driver」→ Run workflow。大約一到兩分鐘，成功後網址是 `https://你的帳號.github.io/pce-driver/`。

## 之後的運作

- 每個週一到週五台北時間 22:07 檢查一次（BEA 在美東 8:30 發布）。有新資料才 commit 並重新部署；沒有就什麼都不做。
- 每次都重抓 2016 年以來的完整歷史，所以 BEA 對過去幾個月的修正也會反映出來。
- 執行失敗時 GitHub 會寄信通知，網站維持上一版。錯誤訊息會說明原因，常見的有：
  - **key 錯誤或失效**：到 Settings → Secrets 更新 `BEA_API_KEY`。
  - **BEA 改了表格結構**：訊息會列出哪幾列不同。下載新的 2.4.4U 月資料 Excel，執行 `python pipeline/make_structure.py 檔名.xlsx`，補上新項目的中文名稱後 commit。
- 公開 repository 連續 60 天沒有任何活動，排程會被 GitHub 自動停用。正常情況下每月都有資料 commit，不會碰到；如果 BEA 長時間沒有發布，到 Actions 頁面按 Enable workflow 即可。
- 修改網頁：編輯 `site/template.html` 並 commit，會自動重新部署。

## 手動更新（備援）

API 暫時不能用時，可以從 BEA iTable 下載兩張表的月資料 Excel：

```
pip install openpyxl
python pipeline/build_data.py --excel 2.4.4U.xlsx 2.4.5U.xlsx --out data/pce.json
python build_site.py data/pce.json public/index.html
```

然後 commit `data/pce.json`，排程下次執行時會部署。

## 本機測試

```
export BEA_API_KEY=你的key      # Windows PowerShell：$env:BEA_API_KEY="你的key"
python pipeline/build_data.py --api --out data/pce.json
python build_site.py
```

用瀏覽器打開 `public/index.html`。只需要 Python 3.9 以上，不用安裝其他套件。
