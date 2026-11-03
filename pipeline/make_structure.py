"""
從 BEA iTable 匯出的 Table 2.4.4U（月資料 Excel）產生 structure.json。
只有在 BEA 改版表格（新增、刪除或搬動項目）時才需要重跑；既有的中文名稱會保留。

    pip install openpyxl
    python pipeline/make_structure.py 2.4.4U.xlsx
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources import STRUCTURE, read_excel_table   # noqa: E402
from tree import clean_label                       # noqa: E402

_, _, lines = read_excel_table(sys.argv[1])
old = {}
if os.path.exists(STRUCTURE):
    with open(STRUCTURE, encoding="utf-8") as f:
        old = {s["line"]: s for s in json.load(f)}

out, missing = [], []
for l in lines:
    prev = old.get(l["line"])
    zh = prev["zh"] if prev and clean_label(prev["label"]) == clean_label(l["label"]) else None
    if not zh:
        missing.append(l["line"])
    out.append({"line": l["line"], "indent": l["indent"], "label": l["label"], "zh": zh or clean_label(l["label"]),
                "hasPrice": any(v is not None for v in l["values"])})

with open(STRUCTURE, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=0)
print(f"structure.json：{len(out)} 列", f"；以下列沒有中文名稱，暫用英文：{missing}" if missing else "")
