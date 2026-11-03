"""
依 BEA 主表結構建樹，並整理成 PCE Driver 頁面使用的資料。

輸入格式（Excel 與 API 兩種來源都轉成這個樣子）：
  months: ["2016-01", ...]
  P, E:   [{"line": 1, "indent": 3, "label": "Personal consumption expenditures", "values": [...]}, ...]
          P 是 Table 2.4.4U 價格指數，E 是 Table 2.4.5U 名目支出（百萬美元）

樹狀結構完全依照 BEA 主表（line 1–368）的縮排。三個例外處理：
1. 本身有價格指數、子項含 "Less:" 的淨額項目（家庭保險淨額、非營利機構最終消費）視為最細項目。
2. 沒有價格指數的淨額項目（美國居民海外淨支出、淨海外旅遊）往下拆，"Less:" 子項以負支出計入。
3. 只剩一個子項、且本身有價格指數的節點（承租固定住宅及房東耐久財）視為最細項目。
"""
import re

MAIN_LAST_LINE = 368          # 主表最後一列；之後是額外彙總
CORE_LINE = 374               # PCE excluding food and energy（官方核心 PCE）
NON_CORE_ROOTS = (73, 113, 169)  # 居家食品及飲料；汽油等能源商品；電力與天然氣


def clean_label(s):
    s = re.sub(r"\s*\((?:parts? of )?[\d, and]+\)\s*$", "", s)   # 去掉 Table 2.5.4 對照行號
    s = re.sub(r"(\D)[12]$", r"\1", s)                            # 去掉註腳數字
    return s.strip()


def build_raw_tree(lines):
    """依縮排建立父子關係；line 1 為根。"""
    main = [l for l in lines if l["line"] <= MAIN_LAST_LINE]
    nodes = {l["line"]: dict(l, children=[], parent=None) for l in main}
    stack = []
    for l in main[1:]:
        while stack and stack[-1][0] >= l["indent"]:
            stack.pop()
        parent = stack[-1][1] if stack else 1
        nodes[l["line"]]["parent"] = parent
        nodes[parent]["children"].append(l["line"])
        stack.append((l["indent"], l["line"]))
    return nodes


def build_data(months, P, E, zh, revised="", next_release="", source=""):
    raw = build_raw_tree(P)
    PV = {l["line"]: l["values"] for l in P}
    EV = {l["line"]: l["values"] for l in E}

    has_price = lambda ln: all(v is not None for v in PV.get(ln, [None]))
    is_less = lambda ln: raw[ln]["label"].startswith("Less:")

    def sign(ln):
        s = 1
        while ln:
            if is_less(ln):
                s = -s
            ln = raw[ln]["parent"]
        return s

    def under(ln, roots):
        while ln:
            if ln in roots:
                return True
            ln = raw[ln]["parent"]
        return False

    nodes, leaves = {}, []

    def visit(ln, parent):
        kids = [c for c in raw[ln]["children"] if has_price(c) or raw[c]["children"]]
        net_with_price = has_price(ln) and any(is_less(c) for c in raw[ln]["children"])
        leaf = net_with_price or not kids or (len(kids) == 1 and has_price(ln))
        nodes[ln] = {
            "id": ln, "p": parent,
            "zh": zh.get(ln) or clean_label(raw[ln]["label"]),
            "en": clean_label(raw[ln]["label"]),
            "kids": [] if leaf else kids,
            "lf": leaf,
            "price": PV[ln] if has_price(ln) else None,
        }
        if leaf:
            if not has_price(ln):
                raise ValueError(f"最細項目 line {ln}（{raw[ln]['label']}）沒有完整的價格指數")
            if any(v is None for v in EV.get(ln, [None])):
                raise ValueError(f"最細項目 line {ln}（{raw[ln]['label']}）沒有完整的支出資料")
            core = not under(ln, NON_CORE_ROOTS)
            leaves.append({"id": ln, "core": core, "spend": [round(v * sign(ln)) for v in EV[ln]]})
            nodes[ln]["core"] = core
            return
        for c in kids:
            visit(c, ln)
        nodes[ln]["core"] = any(nodes[c]["core"] for c in kids)

    visit(1, None)

    # 驗證：每個有支出資料的節點 = 底下最細項目支出的加總（容許四捨五入誤差）
    leaf_spend = {l["id"]: l["spend"] for l in leaves}

    def leaf_ids(ln):
        n = nodes[ln]
        return [ln] if n["lf"] else [x for c in n["kids"] for x in leaf_ids(c)]

    t = len(months) - 1
    for ln, n in nodes.items():
        v = EV.get(ln, [None] * len(months))[t]
        if v is None:
            continue
        s = sum(leaf_spend[x][t] for x in leaf_ids(ln)) * sign(ln)
        if abs(s - v) > max(5, 1e-5 * abs(v)):
            raise ValueError(f"line {ln}（{n['en']}）子項支出加總 {s} 與表上數字 {v} 不符，BEA 表格結構可能改變")

    for ln in (1, CORE_LINE):
        if not has_price(ln):
            raise ValueError(f"找不到 line {ln} 的官方價格指數")

    y, m = months[-1].split("-")
    data = {
        "source": source,
        "vintage": (f"BEA {revised} 版" if revised else "BEA") + f" · 資料至 {y} 年 {int(m)} 月",
        "revised": revised,
        "nextRelease": next_release,
        "months": months,
        "official": {"pce": PV[1], "core": PV[CORE_LINE]},
        "nodes": [nodes[k] for k in sorted(nodes)],
        "leaves": leaves,
    }
    depth = lambda ln: 0 if nodes[ln]["lf"] else 1 + max(depth(c) for c in nodes[ln]["kids"])
    summary = (f"{months[0]} → {months[-1]} | 節點 {len(nodes)}（可展開 {sum(1 for n in nodes.values() if not n['lf'])}）"
               f" | 最細項目 {len(leaves)} | 最深 {depth(1)} 層")
    return data, summary
