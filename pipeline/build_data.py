"""
產生 PCE Driver 的資料檔。

  從 BEA API（排程使用，需要環境變數 BEA_API_KEY）：
      python pipeline/build_data.py --api --out data/pce.json

  從 iTable 匯出的 Excel（手動備援，需要 pip install openpyxl）：
      python pipeline/build_data.py --excel 2.4.4U.xlsx 2.4.5U.xlsx --out data/pce.json
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources import fetch_api, read_excel   # noqa: E402
from tree import build_data                 # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--api", action="store_true", help="從 BEA API 讀取")
    src.add_argument("--excel", nargs=2, metavar=("PRICE_XLSX", "SPEND_XLSX"), help="從 Excel 讀取")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    try:
        if a.api:
            meta, months, P, E, zh = fetch_api(os.environ.get("BEA_API_KEY", "").strip())
            source = "api"
        else:
            meta, months, P, E, zh = read_excel(*a.excel)
            source = "excel"
        if not meta["revised"]:
            # 找不到版本日期時，把 BEA 的說明文字印在紀錄裡，方便調整讀取方式
            print(f"::notice::BEA 說明文字中找不到版本日期：{meta.get('notes') or '（沒有說明文字）'}")
        data, summary = build_data(months, P, E, zh, meta["revised"], meta["next"], source)
    except Exception as e:
        # GitHub 的 Annotations 只顯示每則錯誤的第一行，所以每一行分開輸出
        for line in str(e).splitlines():
            if line.strip():
                print(f"::error::{line.strip()}")
        sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(data["vintage"], "|", summary)


if __name__ == "__main__":
    main()
