"""把資料與計算程式嵌入網頁模板，輸出單一 HTML 檔。

    python build_site.py data/pce.json public/index.html
"""
import os
import sys
from pathlib import Path

here = Path(__file__).parent
data_file = Path(sys.argv[1]) if len(sys.argv) > 1 else here / "data" / "pce.json"
out = Path(sys.argv[2]) if len(sys.argv) > 2 else here / "public" / "index.html"

html = (here / "site" / "template.html").read_text(encoding="utf-8")
html = html.replace("/*DATA*/null", data_file.read_text(encoding="utf-8").strip())
html = html.replace("/*COMPUTE*/", (here / "site" / "compute.js").read_text(encoding="utf-8"))
# GitHub Pages 是完整網頁，補上文件開頭（Claude 發布時會自動加上這些）
if not html.lstrip().lower().startswith("<!doctype"):
    html = ('<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n'
            + html + "\n</body>\n</html>\n")
os.makedirs(out.parent, exist_ok=True)
out.write_text(html, encoding="utf-8")
print(out, len(html.encode()) // 1024, "KB")
