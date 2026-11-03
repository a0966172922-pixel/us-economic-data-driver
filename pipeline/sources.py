"""
兩種資料來源，輸出相同格式（見 tree.py）：
- fetch_api：呼叫 BEA API（排程使用）。樹狀結構取自 structure.json，API 只提供數值。
- read_excel：讀取 BEA iTable 匯出的 Excel（手動備援，需要 openpyxl）。
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
STRUCTURE = os.path.join(HERE, "structure.json")
API_URL = os.environ.get("BEA_API_URL", "https://apps.bea.gov/api/data/")
TABLES = {"price": "U20404", "spend": "U20405"}   # Table 2.4.4U、2.4.5U
FIRST_YEAR = 2016
MONTHS_EN = "January February March April May June July August September October November December".split()


def load_structure():
    with open(STRUCTURE, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- BEA API
def _get(params, tries=4):
    url = API_URL + "?" + urllib.parse.urlencode(params)
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pce-driver/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            time.sleep(10 * (k + 1))
    raise RuntimeError(f"連不上 BEA API：{last}")


def _num(s):
    if s is None:
        return None
    try:
        return float(str(s).replace(",", ""))
    except ValueError:
        return None   # "---"、"(NA)" 等


def _fetch_table(key, table, years):
    payload = _get({
        "UserID": key, "method": "GetData", "DataSetName": "NIUnderlyingDetail",
        "TableName": table, "Frequency": "M", "Year": ",".join(map(str, years)),
        "ResultFormat": "JSON",
    })
    api = payload.get("BEAAPI", {})
    res = api.get("Results")
    if isinstance(res, list):
        res = res[0] if res else {}
    err = api.get("Error") or (res or {}).get("Error")
    if err or not res or "Data" not in res:
        detail = err.get("APIErrorDescription", err) if isinstance(err, dict) else err
        raise RuntimeError(f"BEA API 回傳錯誤（{table}）：{detail or '沒有資料'}")
    notes = " ".join(n.get("NoteText", "") for n in res.get("Notes", []))
    return res["Data"], notes


def _find_date(pattern, text):
    m = re.search(pattern + r"\s*:?\s*([A-Z][a-z]+ \d{1,2}, \d{4})", text)
    return m.group(1) if m else ""


def fetch_api(key):
    if not key:
        raise RuntimeError("沒有設定 BEA_API_KEY")
    struct = load_structure()
    years = list(range(FIRST_YEAR, date.today().year + 1))
    tables, notes = {}, ""
    for kind, table in TABLES.items():
        rows, note = _fetch_table(key, table, years)
        notes += " " + note
        vals = {}
        for r in rows:
            ln = int(r["LineNumber"])
            tp = r["TimePeriod"]                      # 例如 2026M08
            if "M" not in tp:
                continue
            month = f"{tp[:4]}-{int(tp.split('M')[1]):02d}"
            v = _num(r.get("DataValue"))
            if v is not None and kind == "spend":     # 一律換算成百萬美元
                v = v * 10 ** int(r.get("UNIT_MULT") or 6) / 1e6
            vals.setdefault(ln, {"label": r.get("LineDescription", ""), "v": {}})["v"][month] = v
        tables[kind] = vals

    # 兩張表共同涵蓋、且整體 PCE 有數字的月份
    def months_of(kind):
        return {m for m, v in tables[kind].get(1, {"v": {}})["v"].items() if v is not None}
    months = sorted(months_of("price") & months_of("spend"))
    if len(months) < 24:
        raise RuntimeError(f"API 回傳的月份太少（{len(months)} 個月）")

    # 結構檢查：API 的列名稱要和 structure.json 對得上，否則代表 BEA 改了表格
    problems = []
    for s in struct:
        got = tables["price"].get(s["line"])
        if got is None:
            # API 不會回傳整列都沒有數字的項目；結構檔標記 hasPrice=false 的列本來就是空的
            if s["line"] <= 368 and s.get("hasPrice", True):
                problems.append(f"line {s['line']} 不見了（{s['label']}）")
            continue
        a, b = _norm(s["label"]), _norm(got["label"])
        if a and b and SequenceMatcher(None, a, b).ratio() < 0.6:
            problems.append(f"line {s['line']}：原本是「{s['label']}」，API 是「{got['label']}」")
    if problems:
        raise RuntimeError("BEA 表格結構和 structure.json 不同，需要更新結構檔：\n  " + "\n  ".join(problems[:15]))

    def lines(kind):
        out = []
        for s in struct:
            v = tables[kind].get(s["line"], {"v": {}})["v"]
            out.append({"line": s["line"], "indent": s["indent"], "label": s["label"],
                        "values": [v.get(m) for m in months]})
        return out

    meta = {
        "revised": _find_date(r"(?:Last Revised on|Release Date)", notes),
        "next": _find_date(r"Next Release Date", notes),
    }
    return meta, months, lines("price"), lines("spend"), {s["line"]: s["zh"] for s in struct}


def _norm(s):
    s = re.sub(r"\(.*?\)", " ", s or "")
    s = re.sub(r"[^a-z]+", " ", s.lower())
    return " ".join(s.split())


# ---------------------------------------------------------------- Excel（備援）
MON = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}


def read_excel_table(path):
    import warnings
    import openpyxl  # 只有用 Excel 時才需要
    warnings.filterwarnings("ignore", module="openpyxl")
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    head = rows[3][0] or ""
    yr_row, mo_row = rows[5], rows[6]
    months, cols, year = [], [], None
    for j in range(2, len(mo_row)):
        if yr_row[j] not in (None, ""):
            year = int(yr_row[j])
        if mo_row[j] in MON:
            months.append(f"{year}-{MON[mo_row[j]]:02d}")
            cols.append(j)
    lines = []
    for r in rows[7:]:
        if r[0] is None or not str(r[0]).strip().isdigit():
            continue
        raw = r[1] or ""
        lines.append({
            "line": int(r[0]),
            "indent": (len(raw) - len(raw.lstrip(" "))) // 4,
            "label": raw.strip(),
            "values": [float(r[j]) if isinstance(r[j], (int, float)) else None for j in cols],
        })
    meta = {
        "revised": _find_date(r"Last Revised on", head),
        "next": _find_date(r"Next Release Date", head),
    }
    return meta, months, lines


def read_excel(price_xlsx, spend_xlsx):
    meta, months, P = read_excel_table(price_xlsx)
    _, months_e, E = read_excel_table(spend_xlsx)
    if months != months_e:
        raise RuntimeError("兩份 Excel 的月份不一致")
    zh = {s["line"]: s["zh"] for s in load_structure()} if os.path.exists(STRUCTURE) else {}
    return meta, months, P, E, zh
