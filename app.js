// Retail Sales Driver 網頁互動（build_site.py 會把這個檔案和 compute.js 嵌入 template.html）
(() => {
  const S = DATA.structure;
  const T = DATA.months.length;
  const ADV = T - 1;                                   // 最新一個月是初值
  const LEAF = new Map(S.leaves.map(l => [l.id, { ...l, vals: Float64Array.from(DATA.leaves[l.id]) }]));
  const NODE = new Map(S.nodes.map(n => [n.id, n]));
  const VIEWS = S.views;
  const TOTAL = "TOTAL", CUSTOM = "CUSTOM", MAX_PICK = 9;
  const FIXED = S.fixed_slots || {};
  const FIXED_PARENTS = new Set(["TOTAL", "EXA", "EXG", "EXAG", "RETAIL"]);   // 這幾層的子項固定配色
  const isLeaf = id => LEAF.has(id);
  const known = id => LEAF.has(id) || NODE.has(id) || id === CUSTOM;

  const state = { view: "total", mode: "mom", range: "24", from: null, to: null, sort: "contrib", t: T - 1, node: TOTAL, customOnly: false, customKind: "contrib" };

  // ---------- 每一層各自記住隱藏的項目與總計線（重新整理後恢復預設） ----------
  const hiddenByLevel = new Map(), lineByLevel = new Map();
  const levelKey = () => `${state.view}|${state.node}`;
  function hiddenSet() {
    const k = levelKey();
    if (!hiddenByLevel.has(k)) hiddenByLevel.set(k, new Set());
    return hiddenByLevel.get(k);
  }
  // 金額圖的總計線就是柱子頂端，預設不畫；貢獻圖預設要畫
  const lineKey = () => `${levelKey()}|${state.mode === "level" ? "L" : "C"}`;
  const lineShown = () => lineByLevel.has(lineKey()) ? lineByLevel.get(lineKey()) : state.mode !== "level";

  // ---------- 金額：任何項目都是最細項目相加 ----------
  let customSel = [];
  const leafMemo = new Map();
  function leavesOf(id) {
    if (id === CUSTOM) return customSel.flatMap(leavesOf);
    if (isLeaf(id)) return [id];
    if (!leafMemo.has(id)) leafMemo.set(id, NODE.get(id).kids.flatMap(leavesOf));
    return leafMemo.get(id);
  }
  const levelMemo = new Map();
  function levelOfLeaves(ids) {
    const key = ids.join(",");
    if (!levelMemo.has(key)) levelMemo.set(key, sumSeries(ids.map(l => LEAF.get(l).vals), T));
    return levelMemo.get(key);
  }
  const level = id => levelOfLeaves(leavesOf(id));
  const BASE = () => level(TOTAL);
  const restLeaves = () => { const p = new Set(leavesOf(CUSTOM)); return leavesOf(TOTAL).filter(l => !p.has(l)); };

  // ---------- 自訂組合（記在瀏覽器裡） ----------
  const CUSTOM_KEY = "retail-sales-driver-custom";
  const overlaps = (a, b) => { const s = new Set(leavesOf(a)); return leavesOf(b).some(l => s.has(l)); };
  function setSelection(ids) {
    const clean = [];
    for (const id of ids) {
      if (!known(id) || id === CUSTOM || id === TOTAL || clean.includes(id)) continue;
      if (clean.some(s => overlaps(s, id))) continue;          // 內容重疊的項目不能同時選
      if (clean.length >= MAX_PICK) break;
      clean.push(id);
    }
    customSel = clean;
    const hid = hiddenByLevel.get(`custom|${CUSTOM}`);
    if (hid) for (const h of [...hid]) if (!clean.includes(h)) hid.delete(h);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify({ ids: clean, only: state.customOnly })); } catch (e) {}
  }
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "null");
    if (saved) { state.customOnly = !!saved.only; setSelection(Array.isArray(saved.ids) ? saved.ids.map(String) : []); }
  } catch (e) { setSelection([]); }

  // ---------- 組合圖（自訂的第二種圖）：不同項目的金額、年增率、月增率畫在同一張圖 ----------
  const COMBO_KEY = "retail-sales-driver-combo", MAX_SERIES = 9;
  const MEASURE_WORD = { level: "金額", yoy: "年增率", mom: "月增率" };
  const unitOf = m => m === "level" ? "億美元" : "%";
  const defaultsFor = m => m === "level" ? { type: "bar", axis: "L" } : { type: "line", axis: "R" };   // 金額預設左軸柱子，變動率預設右軸折線
  const COMBO_EXAMPLES = [
    { label: "總計金額＋年增率", s: [["TOTAL", "level", "bar", "L"], ["TOTAL", "yoy", "line", "R"]] },
    { label: "總計與控制組年增率", s: [["TOTAL", "yoy", "line", "R"], ["CTRL", "yoy", "line", "R"]] },
    { label: "各指標月增率", s: [["TOTAL", "mom", "bar", "R"], ["EXA", "mom", "bar", "R"], ["EXAG", "mom", "bar", "R"], ["CTRL", "mom", "bar", "R"]] },
    { label: "電商、百貨、量販年增率", s: [["454", "yoy", "line", "R"], ["4522", "yoy", "line", "R"], ["4523", "yoy", "line", "R"]] },
  ];
  const toSeries = a => ({ id: a[0], m: a[1], type: a[2], axis: a[3] });
  let combo = [], addMeasure = "yoy";
  const saveCombo = () => { try { localStorage.setItem(COMBO_KEY, JSON.stringify({ kind: state.customKind, add: addMeasure, series: combo })); } catch (e) {} };
  function setCombo(list) {
    const out = [];
    for (const x of list) {
      if (!x || !known(x.id) || x.id === CUSTOM || !MEASURE_WORD[x.m]) continue;
      if (out.some(y => y.id === x.id && y.m === x.m)) continue;      // 同一項目的同一種數值只能加一次
      if (out.length >= MAX_SERIES) break;
      out.push({ id: x.id, m: x.m, type: x.type === "bar" ? "bar" : "line", axis: x.axis === "L" ? "L" : "R" });
    }
    combo = out;
    saveCombo();
  }
  try {
    const saved = JSON.parse(localStorage.getItem(COMBO_KEY) || "null");
    if (saved) {
      state.customKind = saved.kind === "combo" ? "combo" : "contrib";
      if (MEASURE_WORD[saved.add]) addMeasure = saved.add;
      setCombo(Array.isArray(saved.series) ? saved.series : []);
    } else combo = COMBO_EXAMPLES[0].s.map(toSeries);
  } catch (e) { combo = COMBO_EXAMPLES[0].s.map(toSeries); }
  const isCombo = () => state.view === "custom" && state.customKind === "combo";

  // ---------- 名稱 ----------
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const name = id => id === CUSTOM ? "自訂組合" : (LEAF.get(id) || NODE.get(id)).zh;
  const enOf = id => id === CUSTOM ? "Custom selection" : (LEAF.get(id) || NODE.get(id)).en;
  const codeOf = id => { const l = LEAF.get(id); if (l) return `NAICS ${l.naics}`; const n = NODE.get(id); return n && n.census ? `Census ${n.census}` : "自行計算"; };
  function sourceNote(id) {
    if (id === CUSTOM) return `${customSel.length} 個項目 · 以整體零售為基準${state.customOnly ? " · 只看所選項目" : ""}`;
    const l = LEAF.get(id);
    if (l) return `${l.en} · NAICS ${l.naics}${l.note ? "（" + l.note + "）" : ""}`;
    const n = NODE.get(id);
    return `${n.en} · ${n.census ? "Census 序列 " + n.census : "Census 未公布，自行計算"}`;
  }
  const monthLabel = t => { const [y, m] = DATA.months[t].split("-"); return `${y} 年 ${+m} 月`; };
  const advTag = t => t === ADV ? "（初值）" : "";
  const signed = (v, d) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d);
  const fmtAmt = (v, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtPct = (v, d = 2) => v === null || !isFinite(v) ? "—" : signed(v, d) + "%";
  const isLevel = () => state.mode === "level";
  const lag = () => lagOf(state.mode);
  const firstValid = () => isCombo() ? (combo.some(x => x.m === "yoy") ? 12 : combo.some(x => x.m === "mom") ? 1 : 0)
    : state.mode === "yoy" ? 12 : state.mode === "mom" ? 1 : 0;
  const chgWord = () => state.mode === "yoy" ? "年增率" : "月增率";
  const modeWord = () => isLevel() ? "金額" : chgWord();
  const own = (s, t, L) => t - L < 0 || !s[t - L] ? null : pctChange(s, t, L);
  const decFor = vals => {
    const a = vals.map(Math.abs), m = Math.max(...a, 0);
    let d = m >= 0.1 ? 2 : m >= 0.01 ? 3 : 4;
    const smallest = Math.min(...a.filter(v => v > 0), Infinity);
    if (d < 4 && smallest < 0.5 * Math.pow(10, -d)) d++;   // 讓很小的貢獻不會顯示成 0
    return d;
  };
  // 單一項目在目前圖表模式下的數值：金額（億美元）或對整體零售的貢獻（百分點）
  const valueAt = (s, t) => isLevel() ? s[t] / 100 : contribution(s, BASE(), t, lag());
  const fmtVal = (v, d) => isLevel() ? fmtAmt(v, 0) : signed(v, d);

  // ---------- 檢視與樹狀結構 ----------
  const viewObj = () => VIEWS.find(v => v.id === state.view);
  const rootId = () => state.view === "custom" ? CUSTOM : viewObj().root;
  const kidsOf = id => id === CUSTOM ? customSel : isLeaf(id) ? [] : NODE.get(id).kids;
  const parentCache = new Map();
  function parents() {
    const R = rootId();
    if (R === CUSTOM) return new Map([[CUSTOM, null], ...customSel.map(k => [k, CUSTOM])]);
    if (!parentCache.has(R)) {
      const p = new Map([[R, null]]);
      (function walk(id) { for (const k of kidsOf(id)) { p.set(k, id); walk(k); } })(R);
      parentCache.set(R, p);
    }
    return parentCache.get(R);
  }
  const parentOf = id => parents().get(id) ?? null;
  function normalize(id) {
    if (state.view === "custom") return CUSTOM;
    const p = parents();
    if (!p.has(id)) return rootId();
    return isLeaf(id) ? p.get(id) : id;
  }
  const pathTo = id => { const p = []; while (id != null) { p.unshift(id); id = parentOf(id); } return p; };
  function syncHash() {
    try {
      const h = state.view === "custom" ? (state.customKind === "combo" ? "custom/combo" : "custom") : state.node === rootId() ? (state.view === "total" ? "" : state.view) : `${state.view}/${state.node}`;
      if (location.hash.replace("#", "") !== h) history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
    } catch (e) {}
  }
  function readHash() {
    const [v, n] = decodeURIComponent((location.hash || "").replace("#", "")).split("/");
    if (v === "custom") { state.view = "custom"; state.node = CUSTOM; if (n === "combo") state.customKind = "combo"; else if (n) state.customKind = "contrib"; return; }
    if (VIEWS.some(x => x.id === v)) { state.view = v; state.node = normalize(n && known(n) ? n : rootId()); }
  }
  function drillTo(id) { state.node = normalize(id); syncHash(); render(); }
  // 自訂模式裡點某一項：切到能展開它的檢視
  function openInView(id) {
    const v = VIEWS.find(x => x.root === id);
    state.view = v ? v.id : "total";
    state.node = normalize(v ? id : id);
    syncHash(); render();
  }
  const openWhere = id => { const v = VIEWS.find(x => x.root === id); return `「${v ? v.label : "總計"}」`; };

  // ---------- 配色：總計系列的第一層固定顏色，其他依位置 ----------
  const CORP = ["#156082", "#E97132", "#196B24", "#0F9ED5", "#A02B93", "#4EA72E", "#00897B", "#FF8080", "#C8102E"];
  const OTHER_HEX = "#9AA2AE";
  function colorPlan(id) {
    const map = new Map(), hex = new Map(), slot = new Map(), fixed = FIXED_PARENTS.has(id);
    kidsOf(id).forEach((k, i) => {
      const s = fixed && FIXED[k] ? FIXED[k] : i + 1;
      slot.set(k, s); map.set(k, `var(--s${s})`); hex.set(k, CORP[s - 1]);
    });
    return { map, hex, slot };
  }

  // ---------- 某一個月的明細 ----------
  function snapshot(t) {
    const base = BASE(), L = lag(), lv = isLevel(), custom = state.view === "custom";
    const row = (id, s) => {
      s = s || level(id);
      return {
        id, name: id ? name(id) : "", en: id ? enOf(id) : "",
        value: valueAt(s, t), share: s[t] / base[t] * 100,
        change: lv ? own(s, t, 1) : own(s, t, L), diff: (s[t] - s[t - 1]) / 100,
        drill: custom || (id && !isLeaf(id)),
      };
    };
    const rows = kidsOf(state.node).map((id, k) => ({ ...row(id), order: k }));
    const out = { rows, node: row(state.node), total: row(TOTAL), custom, isRoot: state.node === rootId() };
    if (custom) out.rest = row(null, levelOfLeaves(restLeaves()));
    return out;
  }

  // ---------- 期間 ----------
  function rangeBounds() {
    const fv = firstValid();
    if (state.range === "custom") {
      let a = DATA.months.indexOf(state.from), z = DATA.months.indexOf(state.to);
      if (a < 0) a = Math.max(fv, T - 24);
      if (z < 0) z = T - 1;
      a = Math.max(fv, a);
      z = Math.max(a, Math.min(T - 1, z));
      return [a, z];
    }
    return [state.range === "all" ? fv : Math.max(fv, T - +state.range), T - 1];
  }
  function clampT() {
    const [a, z] = rangeBounds();
    if (state.t < a || state.t > z) state.t = z;
  }

  // ---------- 控制列 ----------
  $("view-seg").innerHTML = VIEWS.map(v => `<button type="button" id="vw-${v.id}" data-v="${v.id}">${esc(v.label)}</button>`).join("") +
    `<button type="button" id="vw-custom" data-v="custom">自訂</button>`;
  document.querySelectorAll(".controls .seg, .sortbar .seg").forEach(seg => {
    seg.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      const key = seg.dataset.key;
      if (key === "range" && b.dataset.v === "custom" && state.range !== "custom") {
        const [a, z] = rangeBounds();          // 自訂區間從目前看到的期間開始
        state.from = DATA.months[a]; state.to = DATA.months[z];
      }
      const prevView = state.view;
      state[key] = b.dataset.v;
      if (state.t < firstValid()) state.t = firstValid();
      if (key === "view") {
        // 切換指標：停在同一個項目（若新的指標也有它），否則回到最上層
        const keep = prevView !== "custom" ? state.node : null;
        state.node = state.view === "custom" ? CUSTOM : rootId();
        if (keep && parents().has(keep) && keep !== TOTAL) state.node = normalize(keep);
        syncHash();
      } else state.node = normalize(state.node);
      if (key === "range" || key === "mode") clampT();
      render();
    });
  });
  $("from").addEventListener("change", e => { state.from = e.target.value; if (state.from > state.to) state.to = state.from; clampT(); render(); });
  $("to").addEventListener("change", e => { state.to = e.target.value; if (state.to < state.from) state.from = state.to; clampT(); render(); });
  $("prev").addEventListener("click", () => { if (state.t > firstValid()) { state.t--; render(); } });
  $("next").addEventListener("click", () => { if (state.t < T - 1) { state.t++; render(); } });
  $("month").addEventListener("change", e => { state.t = +e.target.value; render(); });
  $("crumbs").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b) drillTo(b.dataset.id); });

  function syncControls() {
    document.querySelectorAll(".controls .seg, .sortbar .seg").forEach(seg => {
      seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(state[seg.dataset.key] === b.dataset.v)));
    });
    const opts = [];
    for (let t = T - 1; t >= firstValid(); t--) opts.push(`<option value="${t}">${monthLabel(t)}${advTag(t)}</option>`);
    $("month").innerHTML = opts.join("");
    $("month").value = String(state.t);
    $("prev").disabled = state.t <= firstValid();
    $("next").disabled = state.t >= T - 1;
    $("mode-ctl").hidden = isCombo();                   // 組合圖的每條序列各自決定金額或變動率
    const custom = state.range === "custom";
    $("custom-range").hidden = !custom;
    if (custom) {
      const [a, z] = rangeBounds();
      const list = [];
      for (let t = firstValid(); t < T; t++) list.push(`<option value="${DATA.months[t]}">${monthLabel(t)}</option>`);
      $("from").innerHTML = list.join(""); $("to").innerHTML = list.join("");
      $("from").value = DATA.months[a]; $("to").value = DATA.months[z];
    }
  }

  // ---------- 頭條與目前節點 ----------
  function renderReading(snap) {
    const t = state.t, rid = state.view === "custom" ? TOTAL : rootId(), s = level(rid), lv = isLevel();
    $("hero-label").textContent = `${name(rid)} · ${lv ? "季調銷售額" : chgWord()} · ${monthLabel(t)}${advTag(t)}`;
    if (lv) {
      $("hero-num").innerHTML = `${fmtAmt(s[t] / 100)}<small>億美元</small>`;
      $("hero-delta").innerHTML = `月增 <b>${fmtPct(own(s, t, 1))}</b> · 年增 <b>${t >= 12 ? fmtPct(own(s, t, 12)) : "—"}</b>`;
    } else {
      const c = own(s, t, lag()), p = t - 1 >= firstValid() ? own(s, t - 1, lag()) : null;
      $("hero-num").innerHTML = `${c.toFixed(2)}<small>%</small>`;
      const n = NODE.get(rid), parts = [];
      parts.push(n.census ? `Census 公布 <b>${fmtPct(Math.round(c * 10) / 10, 1)}</b>` : `四捨五入 <b>${fmtPct(Math.round(c * 10) / 10, 1)}</b>（自行計算）`);
      if (p !== null) parts.push(`較上月 <b>${signed(c - p, 2)}</b> 個百分點`);
      if (rid !== TOTAL) parts.push(`整體零售 <b>${fmtPct(own(BASE(), t, lag()))}</b>`);
      $("hero-delta").innerHTML = parts.join(" · ");
    }

    $("focus-name").innerHTML = `${esc(name(state.node))}<small>${esc(sourceNote(state.node))}</small>`;
    const nd = snap.node, none = snap.custom && !snap.rows.length;
    const shareTxt = v => none ? "—" : v.toFixed(v < 1 ? 2 : 1) + "%";
    const stats = lv
      ? [["季調銷售額", none ? "—" : fmtAmt(nd.value), "億美元"], ["占整體零售", shareTxt(nd.share), ""], ["月增率", none ? "—" : fmtPct(nd.change), ""]]
      : [[`對整體零售${chgWord()}的貢獻`, none ? "—" : signed(nd.value, decFor([nd.value])), "個百分點"], [`自身${chgWord()}`, none ? "—" : fmtPct(nd.change), ""], ["占整體零售", shareTxt(nd.share), ""]];
    $("stats").innerHTML = stats.map(([k, v, u]) => `<div class="stat"><span>${k}</span><b>${v}</b>${u ? `<small>${u}</small>` : ""}</div>`).join("");

    const rows = snap.rows;
    if (none) { $("story").innerHTML = "還沒有選擇項目，請在上方「自訂組合」勾選想看的細項。"; return; }
    const where = snap.custom ? "所選項目中" : "底下";
    if (lv) {
      const big = [...rows].sort((a, b) => b.value - a.value)[0];
      const up = [...rows].sort((a, b) => b.diff - a.diff), hi = up[0], lo = up[up.length - 1];
      let s2 = `${where}金額最大的是<b>${esc(big.name)}</b>（${fmtAmt(big.value)} 億美元，占整體零售 ${big.share.toFixed(1)}%）`;
      if (t >= 1) {
        s2 += hi.diff > 0 ? `；較上月增加最多的是<b>${esc(hi.name)}</b>（${signed(hi.diff, 1)} 億美元）` : "";
        s2 += lo.diff < 0 ? `${hi.diff > 0 ? "，" : "；"}減少最多的是<b>${esc(lo.name)}</b>（${signed(lo.diff, 1)} 億美元）` : "";
      }
      $("story").innerHTML = s2 + "。";
      return;
    }
    const dd = decFor(rows.map(r => r.value));
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const top = sorted[0], bottom = sorted[sorted.length - 1];
    let s3 = `${where}推升最多的是<b>${esc(top.name)}</b>（${signed(top.value, dd)}）`;
    s3 += bottom.value < 0 ? `，拖累最多的是<b>${esc(bottom.name)}</b>（${signed(bottom.value, dd)}）。` : `，${rows.length} 項都在推升。`;
    $("story").innerHTML = s3;
  }

  // ---------- 堆疊柱狀圖 ----------
  const SVGNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("role", "img");
  $("chart").prepend(svg);
  svg.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft" && state.t > firstValid()) { state.t--; render(); e.preventDefault(); }
    if (e.key === "ArrowRight" && state.t < T - 1) { state.t++; render(); e.preventDefault(); }
    const up = parentOf(state.node);
    if ((e.key === "Escape" || e.key === "Backspace") && up != null && state.view !== "custom") { drillTo(up); e.preventDefault(); }
  });
  function niceStep(span) {
    const raw = span / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function roundedRect(x, y, w, h, r, end) {
    if (h <= 0) return "";
    r = Math.min(r, h, w / 2);
    if (end === "top") return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    if (end === "bottom") return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    return `M${x},${y}h${w}v${h}h${-w}Z`;
  }

  function lineName() {
    const custom = state.view === "custom";
    if (custom && state.customOnly) return "所選項目合計";
    if (custom || state.node === TOTAL) return isLevel() ? "零售及餐飲服務總計" : `整體零售${chgWord()}`;
    return isLevel() ? `${name(state.node)}合計` : `${name(state.node)}的貢獻合計`;
  }
  // 總計線是不是「整體零售的變動率」（是的話標成 %，否則是貢獻的百分點）
  const lineIsRate = () => !isLevel() && (state.view === "custom" ? !state.customOnly : state.node === TOTAL);

  let series = [], segMeta = [];
  function chartSeries(plan) {
    const [start, end] = rangeBounds();
    const kids = kidsOf(state.node);
    const custom = state.view === "custom", rest = custom && !state.customOnly;
    const hid = hiddenSet();
    const nHid = kids.filter(k => hid.has(k)).length;
    segMeta = kids.filter(k => !hid.has(k)).map(k => ({ key: k, id: k, slot: plan.slot.get(k), def: name(k), name: name(k), color: plan.map.get(k), hex: plan.hex.get(k), drill: custom || !isLeaf(k) }));
    if (nHid || rest) {
      const nm = !custom ? `其他（隱藏的 ${nHid} 項）` : rest ? (nHid ? `其他（未選項目與隱藏的 ${nHid} 項）` : "其他（未選項目）") : `其他（隱藏的 ${nHid} 項）`;
      segMeta.push({ key: "other", id: "other", slot: "other", def: "其他", name: nm, color: "var(--other)", hex: OTHER_HEX, drill: false });
    }
    const kidS = kids.map(level), restS = rest ? levelOfLeaves(restLeaves()) : null;
    series = [];
    for (let t = start; t <= end; t++) {
      const vals = new Map();
      let other = 0, sum = 0;
      kids.forEach((k, i) => { const v = valueAt(kidS[i], t); sum += v; if (hid.has(k)) other += v; else vals.set(k, v); });
      if (rest) { const r = valueAt(restS, t); other += r; sum += r; }
      if (nHid || rest) vals.set("other", other);
      series.push({ t, vals, total: sum });
    }
  }

  function drawChart() {
    if (isCombo()) return drawComboChart();
    const box = $("chart");
    const W = box.clientWidth;
    if (!W || !series.length) return;
    const lv = isLevel();
    const H = W < 520 ? 260 : 320;
    const m = { l: lv ? 54 : 50, r: 10, t: 16, b: 40 };
    let lo = 0, hi = 0;
    for (const p of series) {
      let ps = 0, ng = 0;
      p.vals.forEach(v => v >= 0 ? ps += v : ng += v);
      hi = Math.max(hi, ps); lo = Math.min(lo, ng);
      if (lineShown()) { hi = Math.max(hi, p.total); lo = Math.min(lo, p.total); }
    }
    const step = niceStep(hi - lo || 0.01);
    lo = lo < 0 ? Math.floor(lo / step - 1e-6) * step : 0;          // 全部為正（例如金額圖）時從 0 開始
    hi = hi > 0 ? Math.ceil(hi / step + 1e-6) * step : 0;
    const tickDec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const y = v => m.t + (hi - v) / (hi - lo) * ph;
    const band = pw / series.length;
    const bw = Math.max(1, Math.min(24, band * 0.64));
    const rr = bw < 6 ? 0 : 4;
    const cx = i => m.l + band * i + band / 2;

    let out = "";
    for (let v = lo; v <= hi + step * 1e-6; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      const zero = Math.abs(v) < step * 1e-6;
      out += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" style="stroke:var(${zero ? "--axis" : "--rule"})" stroke-width="1"/>`;
      out += `<text x="${m.l - 8}" y="${yy + 4}" text-anchor="end">${lv ? fmtAmt(zero ? 0 : v) : (zero ? 0 : v).toFixed(tickDec)}</text>`;
    }
    const si = series.findIndex(p => p.t === state.t);
    if (si >= 0) out += `<rect x="${m.l + band * si}" y="${m.t}" width="${band}" height="${ph}" rx="4" style="fill:var(--sel)"/>`;
    series.forEach((p, i) => {
      out += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ph + 22}" fill="transparent" style="cursor:pointer"/>`;
    });
    const gap = bw < 4 ? 0 : 1;
    series.forEach((p, i) => {
      const x = cx(i) - bw / 2, adv = p.t === ADV ? " adv" : "";
      const segs = segMeta.map(s => ({ ...s, v: p.vals.get(s.key) || 0 }));
      const pos = segs.filter(s => s.v > 0), neg = segs.filter(s => s.v < 0);
      let acc = 0;
      pos.forEach((s, k) => {
        const y0 = y(acc), y1 = y(acc + s.v); acc += s.v;
        const top = y1 + (k === pos.length - 1 ? 0 : gap), bot = y0 - (k === 0 ? 0 : gap);
        out += `<path class="seg${s.drill ? " drill" : ""}${adv}" data-i="${i}" data-key="${s.key}" d="${roundedRect(x, top, bw, bot - top, rr, k === pos.length - 1 ? "top" : null)}" style="fill:${s.color}"/>`;
      });
      acc = 0;
      neg.forEach((s, k) => {
        const y0 = y(acc), y1 = y(acc + s.v); acc += s.v;
        const top = y0 + (k === 0 ? 0 : gap), bot = y1 - (k === neg.length - 1 ? 0 : gap);
        out += `<path class="seg${s.drill ? " drill" : ""}${adv}" data-i="${i}" data-key="${s.key}" d="${roundedRect(x, top, bw, bot - top, rr, k === neg.length - 1 ? "bottom" : null)}" style="fill:${s.color}"/>`;
      });
    });
    if (lineShown()) {
      const pts = series.map((p, i) => `${cx(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
      out += `<polyline points="${pts}" fill="none" style="stroke:var(--ink);pointer-events:none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (si >= 0) {
      const p = series[si];
      const txt = lv ? fmtAmt(p.total) : lineIsRate() ? p.total.toFixed(2) + "%" : signed(p.total, decFor([p.total]));
      const ly = lineShown() ? y(p.total) : y(Math.max(0, p.total));
      if (lineShown()) out += `<circle cx="${cx(si)}" cy="${ly}" r="4.5" style="fill:var(--ink);stroke:var(--surface);pointer-events:none" stroke-width="2"/>`;
      const anchor = si > series.length - 3 ? "end" : si < 2 ? "start" : "middle";
      out += `<text x="${cx(si)}" y="${Math.max(11, ly - 12)}" text-anchor="${anchor}" style="fill:var(--ink);font-weight:500;font-size:12px;pointer-events:none">${txt}</text>`;
    }
    const every = band < 3 ? 24 : band < 9 ? 12 : band < 16 ? 6 : band < 28 ? 3 : 1;
    const yrEvery = band * 12 < 34 ? 5 : band * 12 < 60 ? 2 : 1;
    series.forEach((p, i) => {
      const yy = +DATA.months[p.t].slice(0, 4), mm = +DATA.months[p.t].slice(5);
      const janSoon = i === 0 && series.slice(1, 5).some(q => DATA.months[q.t].endsWith("-01"));
      if ((mm === 1 && yy % yrEvery === 0) || (i === 0 && !janSoon)) {
        out += `<text class="yr" x="${cx(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : "middle"}">${yy}</text>`;
      }
      const nearSel = every > 1 && Math.abs(p.t - state.t) <= 1 && p.t !== state.t;
      if (((mm - 1) % every === 0 && every < 12 && !nearSel) || p.t === state.t) {
        out += `<text x="${cx(i)}" y="${m.t + ph + 16}" text-anchor="middle" ${p.t === state.t ? 'style="fill:var(--ink);font-weight:500"' : ""}>${mm}</text>`;
      }
    });
    const last = series[series.length - 1];
    if (last.t === ADV && band >= 14) out += `<text class="adv-label" x="${cx(series.length - 1)}" y="${m.t - 4}" text-anchor="end">初值</text>`;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("height", H);
    svg.setAttribute("aria-label", `${name(state.node)} 底下各項目的${lv ? "季調銷售額" : `對整體零售${chgWord()}的貢獻`}，${monthLabel(series[0].t)} 至 ${monthLabel(last.t)}`);
    svg.innerHTML = out;
    svg._geom = { cx, W };
  }

  const tip = $("tip");
  svg.addEventListener("pointermove", e => {
    if (isCombo()) { comboTip(e); return; }
    const el = e.target.closest(".seg, .hit");
    if (!el) { tip.hidden = true; return; }
    const i = +el.dataset.i, p = series[i], on = el.dataset.key, lv = isLevel();
    const d = decFor([...p.vals.values()]);
    const rows = [...segMeta].reverse().map(s =>
      `<div class="${String(s.key) === on ? "on" : ""}"><i style="background:${s.color}"></i><span>${esc(s.name)}</span><b>${fmtVal(p.vals.get(s.key) || 0, d)}</b></div>`).join("");
    const head = lv ? `${fmtAmt(p.total)} 億美元` : lineIsRate() ? `${p.total.toFixed(2)}%` : signed(p.total, d);
    const meta = segMeta.find(s => String(s.key) === on);
    const foot = meta ? (meta.drill ? (state.view === "custom" ? `點一下切到${openWhere(meta.key)}查看這一項` : "點一下展開這一項") : meta.key === "other" ? "「其他」是未選或被隱藏項目的合計" : "這是最細項目") : "點一下切換到這個月";
    const unit = lv ? "億美元" : "百分點";
    tip.innerHTML = `<h3><span>${monthLabel(p.t)}${advTag(p.t)}</span><b>${head}</b></h3>${rows}<p>${unit} · ${foot}${p.t === ADV ? "<br><span class=\"adv-note\">初值：下個月會修正</span>" : ""}</p>`;
    tip.hidden = false;
    const g = svg._geom, scale = svg.clientWidth / g.W, x = g.cx(i) * scale, tw = tip.offsetWidth;
    let left = x + 14;
    if (left + tw > svg.clientWidth) left = x - tw - 14;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = "8px";
  });
  svg.addEventListener("pointerleave", () => { tip.hidden = true; });
  svg.addEventListener("click", e => {
    if (isCombo()) {
      const el = e.target.closest("[data-i]");
      if (el && comboRows[+el.dataset.i]) { state.t = comboRows[+el.dataset.i].t; tip.hidden = true; render(); }
      return;
    }
    const el = e.target.closest(".seg, .hit");
    if (!el) return;
    state.t = series[+el.dataset.i].t;
    const meta = el.classList.contains("seg") ? segMeta.find(s => String(s.key) === el.dataset.key) : null;
    tip.hidden = true;
    if (meta && meta.drill) { if (state.view === "custom") openInView(meta.key); else drillTo(meta.key); } else render();
  });

  // ---------- 下載圖表：PNG，300 dpi，兩種 Word 圖框尺寸 ----------
  const PRESETS = [
    { id: "half", label: "半欄 8.5 × 5.2 公分", wcm: 8.5, hcm: 5.2 },   // 報告左右並排的圖框
    { id: "full", label: "整欄 16 × 9 公分", wcm: 16, hcm: 9 },       // A4 版心寬度
  ];
  const DPI = 300;
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // 在 PNG 裡寫入解析度（pHYs），Word 插入時就會自動用設定的公分尺寸
  function withDpi(png, dpi) {
    const ppm = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4);
    dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let pos = 8, insertAt = -1;
    while (pos + 8 <= png.length) {
      const len = view.getUint32(pos), type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
      if (type === "pHYs") { const out = png.slice(); out.set(chunk.subarray(8, 21), pos + 8); return out; }
      if (type === "IHDR") insertAt = pos + 12 + len;
      if (type === "IDAT" || type === "IEND") break;
      pos += 12 + len;
    }
    if (insertAt < 0) return png;
    const out = new Uint8Array(png.length + 21);
    out.set(png.subarray(0, insertAt), 0);
    out.set(chunk, insertAt);
    out.set(png.subarray(insertAt), insertAt + 21);
    return out;
  }
  const viewLabel = () => state.view === "custom" ? "自訂" : viewObj().label;
  function fileBase() {
    const [a, z] = rangeBounds();
    const where = state.view === "custom" || state.node === rootId() ? viewLabel() : `${viewLabel()}_${name(state.node)}`;
    const raw = isCombo() ? `Retail_Sales_Driver_組合圖_${DATA.months[a]}_${DATA.months[z]}`
      : `Retail_Sales_Driver_${where}_${modeWord()}_${DATA.months[a]}_${DATA.months[z]}`;
    return raw.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "");
  }

  const CJK = '"Microsoft JhengHei", "微軟正黑體", "PingFang TC", "Noto Sans TC", sans-serif';
  const NUM = '"Times New Roman", Times, "Noto Serif", serif';
  const INK = "#1A1A1A", AXIS = "#7F7F7F", TEXT2 = "#404040", GRID = "#D9D9D9";   // 格線與 Excel 預設相同
  const AUTO_SIZES = [9, 8.5, 8, 7.5, 7, 6.5, 6];   // 「自動」由大到小試，圖例不超過圖高 28% 就採用
  const NAMES_KEY = "retail-sales-driver-export-names", FONT_KEY = "retail-sales-driver-export-font",
        COLORS_KEY = "retail-sales-driver-export-colors", PRESET_KEY = "retail-sales-driver-export-size";
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let customColors = load(COLORS_KEY, {}), customNames = load(NAMES_KEY, {}), fontChoice = load(FONT_KEY, "auto"), presetId = load(PRESET_KEY, "half");
  if (!PRESETS.some(p => p.id === presetId)) presetId = "half";
  const preset = () => PRESETS.find(p => p.id === presetId);
  const defaultColor = slot => slot === "line" ? INK : slot === "other" ? OTHER_HEX : CORP[slot - 1] || OTHER_HEX;
  // 下載圖的顏色只能從程式預設的色票挑：公司 9 色、「其他」的灰色、總計線的黑色
  const PALETTE_NAMES = ["深藍", "橘", "深綠", "天藍", "紫", "綠", "青綠", "粉紅", "紅"];
  const PALETTE = [...CORP.map((h, i) => [h, PALETTE_NAMES[i]]), [OTHER_HEX, "灰"], [INK, "黑"]];
  const inPalette = c => typeof c === "string" && PALETTE.some(([h]) => h.toLowerCase() === c.toLowerCase());
  const exportColor = slot => inPalette(customColors[slot]) ? customColors[slot] : defaultColor(slot);   // 以前存的非色票顏色一律改回預設
  // 圖例靠左或置中；總計線實線或虛線、粗細（點）
  const ALIGN_KEY = "retail-sales-driver-export-legend-align", LINE_KEY = "retail-sales-driver-export-line";
  const LINE_WIDTHS = [0.75, 1, 1.5, 2, 2.5, 3];
  let legendAlign = load(ALIGN_KEY, "left") === "center" ? "center" : "left";
  let lineStyle = load(LINE_KEY, { dash: false, width: 1.5 });
  if (!lineStyle || typeof lineStyle !== "object" || !LINE_WIDTHS.includes(+lineStyle.width)) lineStyle = { dash: false, width: 1.5 };
  lineStyle = { dash: !!lineStyle.dash, width: +lineStyle.width };
  const dashPt = w => [Math.max(3, 3 * w), Math.max(2, 2 * w)];          // 虛線的線段與間隔長度（點），隨粗細放大
  const nameKey = (id, def) => `${id}|${def}`;
  const exportName = (id, def) => { const v = customNames[nameKey(id, def)]; return v && v.trim() ? v.trim() : def; };
  // y 軸範圍：依圖表模式分開記（金額與貢獻的數字差很多），只用在下載的圖片，重新整理後恢復自動
  const yRange = { level: [null, null], yoy: [null, null], mom: [null, null], comboL: [null, null], comboR: [null, null] };
  const rangeKey = () => isCombo() ? "comboL" : state.mode;

  function layoutLegend(g, items, fpt, pxW, pt) {
    const fs = fpt * pt;
    const L = {
      fpt, font: `700 ${fs}px ${CJK}`,
      sw: fpt * 0.85 * pt, sh: fpt * 0.6 * pt, lineW: fpt * 1.5 * pt,
      gapIn: fpt * 0.3 * pt, gapOut: fpt * 0.85 * pt, rowH: fpt * 1.35 * pt,
      padX: 2 * pt, top0: 1.5 * pt, rows: [[]],
    };
    g.font = L.font;
    let x = L.padX;
    for (const it of items) {
      let mark = it.kind === "line" ? L.lineW : L.sw;
      if (it.kind === "line" && it.dash) { const [d, gp] = dashPt(it.lw || 1.5); mark = Math.max(mark, (2 * d + gp) * pt); }   // 虛線圖例至少看得到兩段
      const w = mark + L.gapIn + g.measureText(it.name).width;
      if (L.rows[L.rows.length - 1].length && x + w > pxW - L.padX) { L.rows.push([]); x = L.padX; }
      L.rows[L.rows.length - 1].push({ ...it, x, mark, w });
      x += w + L.gapOut;
    }
    if (legendAlign === "center") {
      for (const row of L.rows) {
        if (!row.length) continue;
        const last = row[row.length - 1], shift = (pxW - 2 * L.padX - (last.x + last.w - L.padX)) / 2;
        for (const it of row) it.x += shift;
      }
    }
    L.height = L.top0 + L.rows.length * L.rowH;
    return L;
  }

  function drawExport() {
    if (isCombo()) return drawComboExport();
    const P = preset(), lv = isLevel();
    const pxW = Math.round(P.wcm / 2.54 * DPI), pxH = Math.round(P.hcm / 2.54 * DPI);
    const pt = DPI / 72;                                          // 1 點 = 4.17 像素
    const cv = document.createElement("canvas");
    cv.width = pxW; cv.height = pxH;
    const g = cv.getContext("2d");
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, pxW, pxH);

    const items = segMeta.map(s => ({ name: exportName(s.id, s.def), color: exportColor(s.slot), kind: "box" }));
    if (lineShown()) items.push({ name: exportName("line", lineName()), color: exportColor("line"), kind: "line", lw: lineStyle.width, dash: lineStyle.dash });
    let L;
    if (fontChoice === "auto") {
      for (const f of AUTO_SIZES) { L = layoutLegend(g, items, f, pxW, pt); if (L.height <= pxH * 0.28) break; }
    } else L = layoutLegend(g, items, +fontChoice, pxW, pt);
    const axisPt = Math.max(6, L.fpt - 0.5);

    g.textBaseline = "middle"; g.textAlign = "left";
    L.rows.forEach((row, r) => {
      const cy = L.top0 + r * L.rowH + L.rowH / 2;
      for (const it of row) {
        if (it.kind === "box") { g.fillStyle = it.color; g.fillRect(it.x, cy - L.sh / 2, L.sw, L.sh); }
        else {
          const lw = it.lw || 1.5;
          g.strokeStyle = it.color; g.lineWidth = lw * pt; g.lineCap = "butt";
          g.setLineDash(it.dash ? dashPt(lw).map(v => v * pt) : []);
          g.beginPath(); g.moveTo(it.x, cy); g.lineTo(it.x + it.mark, cy); g.stroke(); g.setLineDash([]);
        }
        g.fillStyle = INK; g.font = L.font;
        g.fillText(it.name, it.x + it.mark + L.gapIn, cy);
      }
    });

    // 金額圖在左上角標單位
    const numFont = `${axisPt * pt}px ${NUM}`, unitFont = `${axisPt * pt}px ${CJK}`;
    let top = L.height + Math.max(0.45 * L.fpt, 0.6 * axisPt) * pt;
    if (lv) {
      g.font = unitFont; g.fillStyle = TEXT2; g.textAlign = "left"; g.textBaseline = "top";
      g.fillText("億美元", L.padX, top - 0.2 * axisPt * pt);
      top += 1.5 * axisPt * pt;
    }
    const bottom = pxH - 1 * pt - 1.7 * axisPt * pt;
    const ph = bottom - top;

    // 座標範圍：自動時依資料，手動時照使用者輸入；刻度數量依圖高與字體大小決定
    let dlo = 0, dhi = 0;
    for (const p of series) {
      let ps = 0, ng = 0;
      p.vals.forEach(v => v >= 0 ? ps += v : ng += v);
      dhi = Math.max(dhi, ps); dlo = Math.min(dlo, ng);
      if (lineShown()) { dhi = Math.max(dhi, p.total); dlo = Math.min(dlo, p.total); }
    }
    const [uLo, uHi] = yRange[state.mode];
    const manualLo = uLo !== null, manualHi = uHi !== null;
    const pad = (dhi - dlo || 0.01) * 0.04;
    let lo = manualLo ? uLo : dlo < 0 ? dlo - pad : 0, hi = manualHi ? uHi : dhi + pad;
    if (hi <= lo) hi = lo + (Math.abs(lo) || 1) * 0.1;
    const maxTicks = Math.max(2, Math.floor(ph / (axisPt * pt * 1.5)) + 1);
    const nextNice = st => { const mag = Math.pow(10, Math.floor(Math.log10(st) + 1e-9)), n = Math.round(st / mag); return (n < 2 ? 2 : n < 5 ? 5 : 10) * mag; };
    const tickCount = st => Math.floor(hi / st + 1e-6) - Math.ceil(lo / st - 1e-6) + 1;
    let step = niceStep(hi - lo);
    for (let guard = 0; guard < 12 && tickCount(step) > maxTicks; guard++) step = nextNice(step);
    const span = hi - lo, loT = Math.floor(lo / step + 1e-6) * step, hiT = Math.ceil(hi / step - 1e-6) * step;
    if (!manualLo && lo - loT <= span * 0.12) lo = loT;     // 兩端對齊到整數刻度；會浪費太多高度時停在資料邊緣
    if (!manualHi && hiT - hi <= span * 0.12) hi = hiT;
    const ticks = [];
    for (let v = Math.ceil(lo / step - 1e-6) * step; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    const tickDec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    const fmtY = v => lv ? fmtAmt(v, tickDec) : v.toFixed(tickDec) + "%";
    g.font = numFont;
    let yLabelW = 0;
    for (const v of ticks) yLabelW = Math.max(yLabelW, g.measureText(fmtY(v)).width);

    const plot = { l: L.padX + yLabelW + 0.4 * axisPt * pt, r: pxW - 4 * pt, t: top, b: bottom };
    const pw = plot.r - plot.l;
    const Y = v => plot.t + (hi - v) / (hi - lo) * ph;
    const band = pw / series.length, bw = Math.max(1, band * 0.6);
    const cx = i => plot.l + band * i + band / 2;

    g.fillStyle = TEXT2; g.textAlign = "right"; g.textBaseline = "middle";
    for (const v of ticks) g.fillText(fmtY(v), plot.l - 0.4 * axisPt * pt, Y(v));
    g.strokeStyle = GRID; g.lineWidth = 0.75 * pt;
    for (const v of ticks) {
      if (v === 0) continue;
      const yy = Math.round(Y(v)) + 0.5;
      g.beginPath(); g.moveTo(plot.l, yy); g.lineTo(plot.r, yy); g.stroke();
    }

    // 柱子與折線只畫在座標範圍內（手動設定範圍時，超出的部分截掉）
    g.save();
    g.beginPath(); g.rect(plot.l - bw, plot.t, pw + 2 * bw, ph); g.clip();
    const gap = Math.max(1, Math.round(0.4 * pt));
    series.forEach((p, i) => {
      const x0 = cx(i) - bw / 2;
      let up = 0, down = 0;
      for (const s of segMeta) {
        const v = p.vals.get(s.key) || 0;
        if (!v) continue;
        const a = v > 0 ? up : down, b = a + v;
        let y0 = Y(Math.max(a, b)), y1 = Y(Math.min(a, b));
        if (bw > 3 * gap && (v > 0 ? up > 0 : down < 0)) { if (v > 0) y1 -= gap; else y0 += gap; }
        if (y1 > y0) { g.fillStyle = exportColor(s.slot); g.fillRect(x0, y0, bw, y1 - y0); }
        if (v > 0) up = b; else down = b;
      }
    });
    if (lo < 0 && hi > 0) {
      g.strokeStyle = AXIS; g.lineWidth = 0.75 * pt;
      g.beginPath(); g.moveTo(plot.l, Math.round(Y(0)) + 0.5); g.lineTo(plot.r, Math.round(Y(0)) + 0.5); g.stroke();
    }
    if (lineShown()) {
      g.strokeStyle = exportColor("line"); g.lineWidth = lineStyle.width * pt; g.lineJoin = "round"; g.lineCap = lineStyle.dash ? "butt" : "round";
      g.setLineDash(lineStyle.dash ? dashPt(lineStyle.width).map(v => v * pt) : []);
      g.beginPath();
      series.forEach((p, i) => { const yy = Y(p.total); if (i) g.lineTo(cx(i), yy); else g.moveTo(cx(i), yy); });
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
    if (lo >= 0 || hi <= 0) {                      // 座標不含 0 時，在底部畫一條軸線
      g.strokeStyle = AXIS; g.lineWidth = 0.75 * pt;
      const yb = Math.round(lo >= 0 ? plot.b : plot.t) + 0.5;
      g.beginPath(); g.moveTo(plot.l, yb); g.lineTo(plot.r, yb); g.stroke();
    }

    // x 軸月份（YYYY/M），依字體大小自動挑選間隔避免重疊
    g.font = numFont; g.fillStyle = TEXT2; g.textBaseline = "top";
    const lab = t => { const [yy, mm] = DATA.months[t].split("-"); return `${yy}/${+mm}`; };
    const need = g.measureText("2026/12").width + 0.8 * axisPt * pt;
    const every = [1, 2, 3, 4, 6, 12, 24, 36, 60, 120].find(k => k * band >= need) || 120;
    // 間隔 12 個月以上時，一律標在 1 月
    const startI = every >= 12 ? Math.max(0, series.findIndex(p => DATA.months[p.t].endsWith("-01"))) : 0;
    for (let i = startI; i < series.length; i += every) {
      const text = lab(series[i].t), w = g.measureText(text).width;
      let xx = cx(i), align = "center";
      if (xx - w / 2 < 0) { xx = 0; align = "left"; }
      else if (xx + w / 2 > pxW) { xx = pxW; align = "right"; }
      g.textAlign = align;
      g.fillText(text, xx, plot.b + 0.65 * axisPt * pt);
    }
    return { cv, legendPt: L.fpt, axisPt, share: L.height / pxH, plotShare: ph / pxH, pxW, pxH, lo, hi };
  }

  // ---------- 下載設定面板 ----------
  const panel = $("export-panel");
  let previewTimer = 0;
  const schedulePreview = () => { clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 120); };
  function updatePreview() {
    const r = drawExport(), P = preset();
    $("ex-img").src = r.cv.toDataURL("image/png");
    $("ex-size").textContent = `實際尺寸 ${P.wcm} × ${P.hcm} 公分（${r.pxW} × ${r.pxH} 像素，${DPI} dpi）· 圖例 ${r.legendPt} 點、座標 ${r.axisPt} 點 · 圖例佔圖高 ${Math.round(r.share * 100)}%`;
    const autoOpt = $("ex-font").querySelector('option[value="auto"]');
    if (autoOpt) autoOpt.textContent = fontChoice === "auto" ? `自動（目前 ${r.legendPt} 點）` : "自動";
    if (isCombo()) {
      const g = (v, ax) => axisUnit(ax) === "億美元" ? fmtAmt(v) : v.toFixed(2);
      const manual = [...yRange.comboL, ...yRange.comboR].some(v => v !== null);
      $("ex-yhint").textContent = `${manual ? "目前有手動設定" : "目前自動"}：${r.dual ? "左軸 " : ""}${g(r.lo, "L")} 至 ${g(r.hi, "L")} ${axisUnit("L")}${r.dual ? ` · 右軸 ${g(r.lo2, "R")} 至 ${g(r.hi2, "R")} ${axisUnit("R")}` : ""}。只影響下載的圖片。`;
    } else {
      const [uLo, uHi] = yRange[state.mode];
      const f = v => isLevel() ? fmtAmt(v) : v.toFixed(2);
      $("ex-yhint").textContent = `${uLo === null && uHi === null ? "目前自動" : "目前手動"}：${f(r.lo)} 至 ${f(r.hi)}${isLevel() ? " 億美元" : "（百分點）"}。只影響下載的圖片，金額、年增、月增分開記。`;
    }
    const warn = $("ex-warn");
    if (r.share > 0.4 || r.plotShare < 0.4) {
      warn.textContent = `圖例佔了圖片高度的 ${Math.round(r.share * 100)}%，柱狀圖會變得很小。建議改小字體、縮短圖例名稱，或改用整欄尺寸。`;
      warn.hidden = false;
    } else warn.hidden = true;
  }
  function syncExportOptions() {
    $("ex-legend-align").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.align === legendAlign)));
    $("ex-line-dash").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.dash === "1") === lineStyle.dash)));
    $("ex-line-width").value = String(lineStyle.width);
    $("ex-line-field").hidden = isCombo();
  }
  function renderExportPanel() {
    closePalette();
    syncExportOptions();
    const focusId = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.id : null;
    $("ex-preset").innerHTML = PRESETS.map(p => `<button type="button" id="ex-p-${p.id}" data-preset="${p.id}" aria-pressed="${p.id === presetId}">${p.label}</button>`).join("");
    const rows = [];
    $("ex-ylabel").textContent = isCombo() && comboDual() ? "左軸範圍" : "y 軸範圍";
    $("ex-range2").hidden = !(isCombo() && comboDual());
    if (isCombo()) {
      combo.forEach((x, i) => {
        const def = seriesLabel(x), key = comboKey(x);
        rows.push(`<div class="ex-row">
        <span class="ex-spacer"></span><button type="button" class="ex-color" id="ex-color-c${i}" data-slot="${i + 1}" style="background:${exportColor(i + 1)}" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(def)} 在下載圖上的顏色（第 ${i + 1} 色），點一下選色"></button>
        <input type="text" id="ex-name-c${i}" data-id="${esc(key)}" data-def="${esc(def)}" value="${esc(exportName(key, def))}" aria-label="${esc(def)} 在下載圖上的名稱">
      </div>`);
      });
      $("ex-items").innerHTML = rows.join("");
      $("ex-font").value = String(fontChoice);
      const fill = (id, v) => { $(id).value = v === null ? "" : v; };
      fill("ex-ymin", yRange.comboL[0]); fill("ex-ymax", yRange.comboL[1]); fill("ex-y2min", yRange.comboR[0]); fill("ex-y2max", yRange.comboR[1]);
      if (focusId && $(focusId)) $(focusId).focus();
      updatePreview();
      return;
    }
    const plan = colorPlan(state.node), hid = hiddenSet();
    for (const k of kidsOf(state.node)) {
      const on = !hid.has(k), def = name(k), slot = plan.slot.get(k);
      rows.push(`<div class="ex-row${on ? "" : " off"}">
        <input type="checkbox" id="ex-show-${k}" data-key="${k}" ${on ? "checked" : ""} aria-label="在圖上顯示 ${esc(def)}">
        <button type="button" class="ex-color" id="ex-color-${k}" data-slot="${slot}" style="background:${exportColor(slot)}" ${on ? "" : "disabled"} aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(def)} 在下載圖上的顏色（第 ${slot} 色），點一下選色"></button>
        <input type="text" id="ex-name-${k}" data-id="${k}" data-def="${esc(def)}" value="${esc(exportName(k, def))}" ${on ? "" : "disabled"} aria-label="${esc(def)} 在下載圖上的名稱">
      </div>`);
    }
    if (segMeta.some(s => s.key === "other")) rows.push(`<div class="ex-row">
        <span class="ex-spacer"></span><button type="button" class="ex-color" id="ex-color-other" data-slot="other" style="background:${exportColor("other")}" aria-haspopup="dialog" aria-expanded="false" aria-label="「其他」在下載圖上的顏色，點一下選色"></button>
        <input type="text" id="ex-name-other" data-id="other" data-def="其他" value="${esc(exportName("other", "其他"))}" aria-label="「其他」在下載圖上的名稱">
      </div>`);
    const ld = lineName();
    rows.push(`<div class="ex-row${lineShown() ? "" : " off"}">
        <input type="checkbox" id="ex-show-line" data-key="line" ${lineShown() ? "checked" : ""} aria-label="在圖上顯示總計線">
        <button type="button" class="ex-color" id="ex-color-line" data-slot="line" style="background:${exportColor("line")}" ${lineShown() ? "" : "disabled"} aria-haspopup="dialog" aria-expanded="false" aria-label="總計線在下載圖上的顏色，點一下選色"></button>
        <input type="text" id="ex-name-line" data-id="line" data-def="${esc(ld)}" value="${esc(exportName("line", ld))}" ${lineShown() ? "" : "disabled"} aria-label="總計線在下載圖上的名稱">
      </div>`);
    $("ex-items").innerHTML = rows.join("");
    $("ex-font").value = String(fontChoice);
    const [uLo, uHi] = yRange[state.mode];
    $("ex-ymin").value = uLo === null ? "" : uLo;
    $("ex-ymax").value = uHi === null ? "" : uHi;
    if (focusId && $(focusId)) $(focusId).focus();
    updatePreview();
  }
  // 色票彈出框
  let paletteBtn = null;
  const slotVal = slot => isNaN(+slot) ? slot : +slot;
  function closePalette() {
    const pal = $("ex-palette");
    if (pal.hidden) return;
    pal.hidden = true;
    if (paletteBtn) paletteBtn.setAttribute("aria-expanded", "false");
    paletteBtn = null;
  }
  function openPalette(btn) {
    const pal = $("ex-palette"), cur = exportColor(slotVal(btn.dataset.slot)).toLowerCase();
    pal.innerHTML = PALETTE.map(([h, n], i) => `<button type="button" class="ex-sw" id="ex-sw-${i}" data-pick="${h}" style="background:${h}" title="${n} ${h}" aria-label="${n} ${h}" aria-pressed="${h.toLowerCase() === cur}"></button>`).join("") +
      `<button type="button" class="dl-btn ex-sw-reset" id="ex-sw-default" data-pick="default">改回這個位置的預設顏色</button>`;
    pal.hidden = false;
    paletteBtn = btn; btn.setAttribute("aria-expanded", "true");
    // 色票放在色塊正下方（相對於下載設定欄位定位，頁面捲動時跟著一起移動）
    const fr = pal.parentElement.getBoundingClientRect(), r = btn.getBoundingClientRect();
    pal.style.left = Math.max(0, Math.min(r.left - fr.left, fr.width - pal.offsetWidth)) + "px";
    pal.style.top = (r.bottom - fr.top + 6) + "px";
    const on = pal.querySelector('[aria-pressed="true"]') || pal.querySelector(".ex-sw");
    if (on) on.focus({ preventScroll: true });
  }
  function pickColor(hex) {
    if (!paletteBtn) return;
    const btn = paletteBtn, slot = btn.dataset.slot, def = defaultColor(slotVal(slot));
    if (hex === "default" || hex.toLowerCase() === def.toLowerCase()) delete customColors[slot]; else customColors[slot] = hex;
    save(COLORS_KEY, customColors);
    btn.style.background = exportColor(slotVal(slot));
    closePalette();
    btn.focus();
    schedulePreview();
  }
  document.addEventListener("click", e => {
    if (!paletteBtn) return;
    if (!e.target.closest("#ex-palette") && e.target.closest(".ex-color") !== paletteBtn) closePalette();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && paletteBtn) { const b = paletteBtn; closePalette(); b.focus(); } });
  window.addEventListener("resize", closePalette);

  panel.addEventListener("click", e => {
    const b = e.target.closest("[data-preset]");
    if (b) { presetId = b.dataset.preset; save(PRESET_KEY, presetId); renderExportPanel(); return; }
    const sw = e.target.closest("[data-pick]");
    if (sw) { pickColor(sw.dataset.pick); return; }
    const cb = e.target.closest("button.ex-color");
    if (cb && !cb.disabled) { if (paletteBtn === cb) closePalette(); else openPalette(cb); return; }
    const al = e.target.closest("[data-align]");
    if (al) { legendAlign = al.dataset.align; save(ALIGN_KEY, legendAlign); syncExportOptions(); updatePreview(); return; }
    const ds = e.target.closest("[data-dash]");
    if (ds) { lineStyle.dash = ds.dataset.dash === "1"; save(LINE_KEY, lineStyle); syncExportOptions(); updatePreview(); }
  });
  panel.addEventListener("change", e => {
    const cb = e.target.closest('input[type="checkbox"][data-key]');
    if (cb) { toggleItem(cb.dataset.key); return; }
    if (e.target.id === "ex-font") { fontChoice = e.target.value; save(FONT_KEY, fontChoice); updatePreview(); }
    if (e.target.id === "ex-line-width") { lineStyle.width = +e.target.value; save(LINE_KEY, lineStyle); updatePreview(); }
  });
  panel.addEventListener("input", e => {
    const yk = { "ex-ymin": [rangeKey(), 0], "ex-ymax": [rangeKey(), 1], "ex-y2min": ["comboR", 0], "ex-y2max": ["comboR", 1] }[e.target.id];
    if (yk) {
      const v = e.target.value.trim(), n = v === "" ? null : Number(v);
      yRange[yk[0]][yk[1]] = n === null || !isFinite(n) ? null : n;
      schedulePreview();
      return;
    }
    const t = e.target.closest('input[type="text"][data-id]');
    if (!t) return;
    const key = nameKey(t.dataset.id, t.dataset.def), v = t.value.trim();
    if (!v || v === t.dataset.def) delete customNames[key]; else customNames[key] = v;
    save(NAMES_KEY, customNames);
    schedulePreview();
  });
  $("ex-yauto").addEventListener("click", () => {
    if (isCombo()) { yRange.comboL = [null, null]; yRange.comboR = [null, null]; } else yRange[state.mode] = [null, null];
    renderExportPanel();
  });
  $("ex-reset").addEventListener("click", () => {
    panel.querySelectorAll('input[type="text"][data-id]').forEach(t => delete customNames[nameKey(t.dataset.id, t.dataset.def)]);
    save(NAMES_KEY, customNames);
    renderExportPanel();
  });
  $("ex-reset-colors").addEventListener("click", () => { customColors = {}; save(COLORS_KEY, customColors); renderExportPanel(); });
  $("ex-close").addEventListener("click", () => { panel.hidden = true; $("download").setAttribute("aria-expanded", "false"); $("download").focus(); });
  $("download").addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    $("download").setAttribute("aria-expanded", String(open));
    if (open) { renderExportPanel(); panel.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  });
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function downloadChart() {
    const btn = $("ex-download");
    btn.disabled = true; btn.textContent = "產生中…";
    try {
      try { await document.fonts.ready; } catch (e) {}
      const { cv } = drawExport();
      const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("瀏覽器無法產生圖檔")), "image/png"));
      const png = withDpi(new Uint8Array(await blob.arrayBuffer()), DPI);
      saveBlob(new Blob([png], { type: "image/png" }), fileBase() + `_${preset().id === "full" ? "整欄" : "半欄"}.png`);
      btn.textContent = "已下載";
    } catch (e) {
      btn.textContent = "下載失敗，請再試一次";
    } finally {
      setTimeout(() => { btn.disabled = false; btn.textContent = "下載 PNG"; }, 1600);
    }
  }
  $("ex-download").addEventListener("click", downloadChart);

  // ---------- 下載資料 CSV：目前這張圖的數字（不受圖例隱藏影響，所有子項都列出） ----------
  function buildCsv() {
    if (isCombo()) return buildComboCsv();
    const [start, end] = rangeBounds(), lv = isLevel();
    const kids = kidsOf(state.node), custom = state.view === "custom", rest = custom && !state.customOnly;
    const cols = kids.map(k => ({ name: name(k), s: level(k) }));
    if (rest) cols.push({ name: "其他（未選項目）", s: levelOfLeaves(restLeaves()) });
    const ownId = custom ? (state.customOnly ? CUSTOM : TOTAL) : state.node;
    const ownName = ownId === CUSTOM ? "所選項目合計" : name(ownId);
    const unit = lv ? "億美元（季節調整、名目）" : `百分點（對整體零售${chgWord()}的貢獻）；最後一欄為自身${chgWord()}（%）`;
    const q = v => /[",\r\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const lines = [
      [`Retail Sales Driver：${chartTitleText()}`],
      [`單位：${unit}`],
      [`資料來源：U.S. Census Bureau, Advance Monthly Retail Trade Survey（${DATA.vintage}）；最新月份為初值`],
      [],
      ["月份", ...cols.map(c => c.name), lineName(), ...(lv ? [] : [`${ownName}自身${chgWord()}（%）`]), "備註"],
    ];
    const ownS = level(ownId);
    for (let t = start; t <= end; t++) {
      const vals = cols.map(c => valueAt(c.s, t));
      const total = vals.reduce((a, b) => a + b, 0);
      const f = v => lv ? v.toFixed(2) : v.toFixed(4);
      const oc = own(ownS, t, lag());
      lines.push([DATA.months[t], ...vals.map(f), f(total), ...(lv ? [] : [oc === null ? "" : oc.toFixed(4)]), t === ADV ? "初值" : ""]);
    }
    return "﻿" + lines.map(r => r.map(q).join(",")).join("\r\n") + "\r\n";
  }
  $("download-csv").addEventListener("click", () => saveBlob(new Blob([buildCsv()], { type: "text/csv;charset=utf-8" }), fileBase() + ".csv"));

  // ---------- 自訂組合面板：樹狀清單、已選清單 ----------
  const cpExpanded = new Set();
  function blockReason(id) {
    if (customSel.includes(id)) return "";
    const hit = customSel.find(s => overlaps(s, id));
    if (hit !== undefined) {
      const a = new Set(leavesOf(hit)), b = leavesOf(id);
      if (b.every(l => a.has(l))) return `已含在「${name(hit)}」裡`;
      const bs = new Set(b);
      if (leavesOf(hit).every(l => bs.has(l))) return `包含已選的「${name(hit)}」`;
      return `與「${name(hit)}」重疊`;
    }
    if (customSel.length >= MAX_PICK) return `最多 ${MAX_PICK} 項`;
    return "";
  }
  const pickCode = id => { const l = LEAF.get(id); if (l) return `NAICS ${l.naics}`; const n = NODE.get(id); return n.census ? n.census : "自行計算"; };
  function matches(id, q) {
    const o = LEAF.get(id) || NODE.get(id);
    return [o.zh, o.en, o.naics || "", o.census || "", id].some(s => String(s).toLowerCase().includes(q));
  }
  function renderTree() {
    const box = $("cp-tree"), scroll = box.scrollTop;
    const q = $("cp-search").value.trim().toLowerCase();
    let show = null;
    if (q) {                                           // 搜尋時：符合的項目與它們的上層
      show = new Set();
      (function walk(ids, up) {
        for (const k of ids) {
          const chain = [...up, k];
          if (matches(k, q)) chain.forEach(c => show.add(c));
          walk(kidsOf(k), chain);
        }
      })(S.picker.tree, []);
    }
    const rowHtml = (k, depth, hasKids, open) => {
      const sel = customSel.includes(k), why = blockReason(k);
      return `<div class="cp-node" role="treeitem"${hasKids ? ` aria-expanded="${open}"` : ""} style="padding-left:${depth * 18}px">` +
        (hasKids ? `<button type="button" class="cp-tog" id="cp-tog-${k}" data-tog="${k}" aria-label="${open ? "收合" : "展開"} ${esc(name(k))}">${open ? "▾" : "▸"}</button>` : `<span class="cp-tog-sp"></span>`) +
        `<label class="${why ? "blocked" : ""}" for="cp-cb-${k}"><input type="checkbox" id="cp-cb-${k}" data-id="${k}" ${sel ? "checked" : ""} ${why ? "disabled" : ""}><span>${esc(name(k))}</span><small>${why ? esc(why) + " · " : ""}${esc(pickCode(k))}</small></label></div>`;
    };
    const rows = [];
    (function walk(ids, depth) {
      for (const k of ids) {
        if (show && !show.has(k)) continue;
        const hasKids = kidsOf(k).length > 0, open = hasKids && (show ? true : cpExpanded.has(k));
        rows.push(rowHtml(k, depth, hasKids, open));
        if (open) walk(kidsOf(k), depth + 1);
      }
    })(S.picker.tree, 0);
    const special = S.picker.special.filter(k => !q || matches(k, q)).map(k => rowHtml(k, 0, false, false));
    if (special.length) rows.push(`<div class="cp-group" role="none">特殊分類（Census 公布的彙總序列）</div>`, ...special);
    box.innerHTML = rows.length ? rows.join("") : `<p class="hint">找不到符合「${esc(q)}」的項目</p>`;
    box.scrollTop = scroll;
  }
  function renderCustomPanel(plan) {
    const focusId = document.activeElement && $("custom-panel").contains(document.activeElement) ? document.activeElement.id : null;
    const cmb = state.customKind === "combo";
    $("cp-kind").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.kind === state.customKind)));
    $("cp-contrib").hidden = cmb; $("cp-combo").hidden = !cmb;
    $("cp-hint").textContent = cmb
      ? "把不同項目的金額、年增率、月增率畫在同一張圖：每條序列可以選柱或線、放左軸或右軸（金額和變動率單位不同，建議分放兩軸）。同一項目可以加入多種數值，項目之間可以重疊，例如總計與控制組。"
      : "勾選想看的細項（最多 9 項），柱子依右邊清單的順序由下往上疊。內容重疊的項目（例如控制組和它底下的家具店）不能同時選。貢獻度一律以整體零售為基準。";
    if (cmb) { renderComboPanel(); if (focusId && $(focusId)) $(focusId).focus(); return; }
    renderTree();
    $("cp-count").textContent = `已選 ${customSel.length} / ${MAX_PICK} 項 · 清單第一項疊在最底層`;
    $("cp-list").innerHTML = customSel.length ? customSel.map((id, i) => `<li>
        <i style="background:${plan.map.get(id)}"></i>
        <span>${esc(name(id))}<small>${esc(pickCode(id))}</small></span>
        <span class="cp-btns">
          <button type="button" id="cp-up-${id}" data-move="${id}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(name(id))} 往前移（疊得更低）">↑</button>
          <button type="button" id="cp-down-${id}" data-move="${id}" data-dir="1" ${i === customSel.length - 1 ? "disabled" : ""} aria-label="${esc(name(id))} 往後移（疊得更高）">↓</button>
          <button type="button" id="cp-del-${id}" data-del="${id}" aria-label="移除 ${esc(name(id))}">✕</button>
        </span>
      </li>`).join("") : `<li><p class="cp-empty">還沒有選擇項目。從左邊勾選，或用搜尋找項目。</p></li>`;
    $("cp-only").checked = state.customOnly;
    $("cp-clear").disabled = !customSel.length;
    if (focusId && $(focusId)) $(focusId).focus();
  }
  $("cp-tree").addEventListener("click", e => {
    const t = e.target.closest("[data-tog]");
    if (!t) return;
    const id = t.dataset.tog;
    if (cpExpanded.has(id)) cpExpanded.delete(id); else cpExpanded.add(id);
    renderTree();
    if ($(`cp-tog-${id}`)) $(`cp-tog-${id}`).focus();
  });
  $("cp-tree").addEventListener("change", e => {
    const cb = e.target.closest("input[data-id]");
    if (!cb) return;
    const id = cb.dataset.id;
    setSelection(cb.checked ? [...customSel, id] : customSel.filter(x => x !== id));
    render();
  });
  let searchTimer = 0;
  $("cp-search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderTree, 150); });
  $("cp-list").addEventListener("click", e => {
    const mv = e.target.closest("[data-move]"), del = e.target.closest("[data-del]");
    if (mv) {
      const id = mv.dataset.move, i = customSel.indexOf(id), j = i + +mv.dataset.dir;
      if (j < 0 || j >= customSel.length) return;
      const next = [...customSel]; [next[i], next[j]] = [next[j], next[i]];
      setSelection(next); render();
    } else if (del) { setSelection(customSel.filter(x => x !== del.dataset.del)); render(); }
  });
  $("cp-only").addEventListener("change", e => { state.customOnly = e.target.checked; setSelection(customSel); render(); });
  $("cp-clear").addEventListener("click", () => { setSelection([]); render(); });

  // ======================================================================
  // 組合圖：每條序列 = 項目 × 數值種類（金額、年增率、月增率）× 柱或線 × 左軸或右軸
  // ======================================================================
  const comboDual = () => new Set(combo.map(x => x.axis)).size === 2;
  const axisOf = x => comboDual() ? x.axis : "L";               // 只用到一個軸時一律畫在左邊
  const seriesLabel = x => `${name(x.id)}（${MEASURE_WORD[x.m]}${comboDual() && x.axis === "R" ? "，右軸" : ""}）`;
  const comboKey = x => `combo:${x.id}:${x.m}`;
  const comboValue = (x, t) => {
    if (t < 0) return null;
    const s = level(x.id);
    return x.m === "level" ? s[t] / 100 : own(s, t, x.m === "yoy" ? 12 : 1);
  };
  const okNum = v => v !== null && v !== undefined && isFinite(v);
  const fmtSeries = (x, v, unit = true) => !okNum(v) ? "—" : x.m === "level" ? fmtAmt(v) + (unit ? " 億美元" : "") : signed(v, 2) + "%";
  function axisUnit(ax) {
    const ss = combo.filter(x => axisOf(x) === ax);
    if (!ss.length) return "";
    return ss.every(x => x.m === "level") ? "億美元" : ss.every(x => x.m !== "level") ? "%" : "億美元／%";
  }
  const mixedAxes = () => ["L", "R"].filter(ax => axisUnit(ax) === "億美元／%");
  const seriesColor = i => `var(--s${i + 1})`;

  let comboRows = [];
  function comboData() {
    const [a, z] = rangeBounds();
    comboRows = [];
    for (let t = a; t <= z; t++) comboRows.push({ t, vals: combo.map(x => comboValue(x, t)) });
  }
  // 某一軸的資料範圍：有柱子或變動率時包含 0；只有金額折線時不必從 0 開始
  function axisData(ax) {
    let lo = Infinity, hi = -Infinity, zero = false, any = false;
    combo.forEach((x, i) => {
      if (axisOf(x) !== ax) return;
      any = true;
      if (x.type === "bar" || x.m !== "level") zero = true;
      for (const r of comboRows) { const v = r.vals[i]; if (okNum(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    });
    if (!any) return null;
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (hi - lo < 1e-9) { hi += 1; if (!zero || lo < 0) lo -= 1; }
    return { lo, hi, zero, unit: axisUnit(ax) };
  }
  function siteScale(d) {
    const step = niceStep(d.hi - d.lo);
    const lo = Math.floor(d.lo / step + 1e-9) * step, hi = Math.ceil(d.hi / step - 1e-9) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return { lo, hi: hi > lo ? hi : lo + step, step, ticks, dec: decOf(step), unit: d.unit };
  }
  const tickText = (sc, v) => sc.unit === "億美元" ? fmtAmt(v, sc.dec) : v.toFixed(sc.dec);
  // 雙軸時右軸用和左軸一樣多的刻度間隔，兩軸格線重合
  function niceAtLeast(x) {
    const mag = Math.pow(10, Math.floor(Math.log10(x)));
    for (const n of [1, 2, 2.5, 5, 10]) if (n * mag >= x * (1 - 1e-9)) return n * mag;
    return 10 * mag;
  }
  function decOf(step) { let d = 0; while (d < 6 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-6) d++; return d; }
  function alignedScale(n, d) {
    let step = niceAtLeast((d.hi - d.lo) / n || 1);
    for (let guard = 0; guard < 30; guard++) {
      const lo = Math.floor(d.lo / step + 1e-9) * step;
      if (lo + n * step >= d.hi - step * 1e-9) {
        const ticks = Array.from({ length: n + 1 }, (_, k) => { const v = lo + k * step; return Math.abs(v) < step * 1e-6 ? 0 : v; });
        return { lo, hi: lo + n * step, step, ticks, dec: decOf(step), unit: d.unit };
      }
      step = niceAtLeast(step * 1.01);
    }
    return siteScale(d);
  }

  function drawComboChart() {
    const box = $("chart"), W = box.clientWidth;
    if (!W) return;
    if (!combo.length || !comboRows.length) {
      svg.setAttribute("viewBox", `0 0 ${W} 120`); svg.setAttribute("height", 120);
      svg.innerHTML = `<text x="${W / 2}" y="64" text-anchor="middle" style="font-size:13px">還沒有序列：請在上方「組合圖」加入項目，或點一個範例</text>`;
      svg._geom = null;
      return;
    }
    const dual = comboDual(), H = W < 520 ? 270 : 330;
    const SL = siteScale(axisData("L")), SR = dual ? alignedScale(SL.ticks.length - 1, axisData("R")) : null;
    const m = { l: 58, r: dual ? 58 : 12, t: 24, b: 40 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const Y = (sc, v) => m.t + (sc.hi - v) / (sc.hi - sc.lo) * ph;
    const band = pw / comboRows.length, cx = i => m.l + band * i + band / 2;
    let out = "";
    for (const v of SL.ticks) {
      const yy = Math.round(Y(SL, v)) + 0.5;
      out += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" style="stroke:var(${v === 0 ? "--axis" : "--rule"})" stroke-width="1"/>`;
      out += `<text x="${m.l - 8}" y="${yy + 4}" text-anchor="end">${tickText(SL, v)}</text>`;
    }
    out += `<text x="${m.l - 8}" y="12" text-anchor="end">${esc(SL.unit)}</text>`;
    if (SR) {
      for (const v of SR.ticks) out += `<text x="${W - m.r + 8}" y="${Math.round(Y(SR, v)) + 4.5}" text-anchor="start">${tickText(SR, v)}</text>`;
      out += `<text x="${W - m.r + 8}" y="12" text-anchor="start">${esc(SR.unit)}</text>`;
      if (SR.lo < 0 && SR.hi > 0 && Math.abs(Y(SR, 0) - Y(SL, Math.max(SL.lo, Math.min(SL.hi, 0)))) > 2) {
        const yy = Math.round(Y(SR, 0)) + 0.5;
        out += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" style="stroke:var(--axis)" stroke-width="1" stroke-dasharray="4 3"/>`;
      }
    }
    const si = comboRows.findIndex(r => r.t === state.t);
    if (si >= 0) out += `<rect x="${m.l + band * si}" y="${m.t}" width="${band}" height="${ph}" rx="4" style="fill:var(--sel)"/>`;
    comboRows.forEach((r, i) => { out += `<rect class="hit" data-i="${i}" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ph + 22}" fill="transparent" style="cursor:pointer"/>`; });
    // 柱子：同一個月的柱子並排，依清單順序由左到右
    const bars = combo.map((x, i) => [x, i]).filter(([x]) => x.type === "bar");
    if (bars.length) {
      const gw = Math.min(band * 0.76, 26 * bars.length), bw = gw / bars.length, gap = bw > 4 ? 1 : 0;
      comboRows.forEach((r, i) => {
        bars.forEach(([x, k], j) => {
          const v = r.vals[k]; if (!okNum(v)) return;
          const sc = axisOf(x) === "L" ? SL : SR, base = Math.max(sc.lo, Math.min(sc.hi, 0));
          const y0 = Y(sc, Math.max(v, base)), y1 = Y(sc, Math.min(v, base));
          out += `<rect class="cbar${r.t === ADV ? " adv" : ""}" data-i="${i}" x="${(cx(i) - gw / 2 + j * bw + gap / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${Math.max(0.8, bw - gap).toFixed(1)}" height="${Math.max(0, y1 - y0).toFixed(1)}" style="fill:${seriesColor(k)}"/>`;
        });
      });
    }
    // 折線：缺值（例如年增率的前 12 個月）斷開
    combo.forEach((x, k) => {
      if (x.type !== "line") return;
      const sc = axisOf(x) === "L" ? SL : SR;
      let d = "", pen = false;
      comboRows.forEach((r, i) => {
        const v = r.vals[k];
        if (!okNum(v)) { pen = false; return; }
        d += `${pen ? "L" : "M"}${cx(i).toFixed(1)},${Y(sc, v).toFixed(1)}`; pen = true;
      });
      out += `<path d="${d}" fill="none" style="stroke:${seriesColor(k)};pointer-events:none" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (si >= 0 && okNum(comboRows[si].vals[k])) out += `<circle cx="${cx(si)}" cy="${Y(sc, comboRows[si].vals[k])}" r="4" style="fill:${seriesColor(k)};stroke:var(--surface);pointer-events:none" stroke-width="2"/>`;
    });
    const every = band < 3 ? 24 : band < 9 ? 12 : band < 16 ? 6 : band < 28 ? 3 : 1;
    const yrEvery = band * 12 < 34 ? 5 : band * 12 < 60 ? 2 : 1;
    comboRows.forEach((r, i) => {
      const yy = +DATA.months[r.t].slice(0, 4), mm = +DATA.months[r.t].slice(5);
      const janSoon = i === 0 && comboRows.slice(1, 5).some(q => DATA.months[q.t].endsWith("-01"));
      if ((mm === 1 && yy % yrEvery === 0) || (i === 0 && !janSoon)) out += `<text class="yr" x="${cx(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : "middle"}">${yy}</text>`;
      const nearSel = every > 1 && Math.abs(r.t - state.t) <= 1 && r.t !== state.t;
      if (((mm - 1) % every === 0 && every < 12 && !nearSel) || r.t === state.t) {
        out += `<text x="${cx(i)}" y="${m.t + ph + 16}" text-anchor="middle" ${r.t === state.t ? 'style="fill:var(--ink);font-weight:500"' : ""}>${mm}</text>`;
      }
    });
    const last = comboRows[comboRows.length - 1];
    if (last.t === ADV && band >= 14) out += `<text class="adv-label" x="${cx(comboRows.length - 1)}" y="${m.t - 4}" text-anchor="middle">初值</text>`;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("height", H);
    svg.setAttribute("aria-label", `組合圖：${combo.map(seriesLabel).join("、")}，${monthLabel(comboRows[0].t)} 至 ${monthLabel(last.t)}`);
    svg.innerHTML = out;
    svg._geom = { cx, W };
  }
  function comboTip(e) {
    const el = e.target.closest("[data-i]");
    if (!el || !svg._geom) { tip.hidden = true; return; }
    const i = +el.dataset.i, r = comboRows[i];
    if (!r) { tip.hidden = true; return; }
    const rows = combo.map((x, k) => `<div><i class="${x.type === "line" ? "ln" : ""}" style="background:${seriesColor(k)}${x.type === "line" ? ";height:3px" : ""}"></i><span>${esc(seriesLabel(x))}</span><b>${fmtSeries(x, r.vals[k])}</b></div>`).join("");
    tip.innerHTML = `<h3><span>${monthLabel(r.t)}${advTag(r.t)}</span></h3>${rows}<p>點一下切換到這個月${r.t === ADV ? "<br><span class=\"adv-note\">初值：下個月會修正</span>" : ""}</p>`;
    tip.hidden = false;
    const g = svg._geom, scale = svg.clientWidth / g.W, x = g.cx(i) * scale, tw = tip.offsetWidth;
    let left = x + 14;
    if (left + tw > svg.clientWidth) left = x - tw - 14;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = "8px";
  }

  // ---------- 組合圖的下載圖片：雙軸、並排柱、折線 ----------
  function drawComboExport() {
    const P = preset(), dual = comboDual();
    const pxW = Math.round(P.wcm / 2.54 * DPI), pxH = Math.round(P.hcm / 2.54 * DPI), pt = DPI / 72;
    const cv = document.createElement("canvas");
    cv.width = pxW; cv.height = pxH;
    const g = cv.getContext("2d");
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, pxW, pxH);
    const items = combo.map((x, i) => ({ name: exportName(comboKey(x), seriesLabel(x)), color: exportColor(i + 1), kind: x.type === "bar" ? "box" : "line" }));
    let L;
    if (fontChoice === "auto") {
      for (const f of AUTO_SIZES) { L = layoutLegend(g, items, f, pxW, pt); if (L.height <= pxH * 0.28) break; }
    } else L = layoutLegend(g, items, +fontChoice, pxW, pt);
    const axisPt = Math.max(6, L.fpt - 0.5);
    g.textBaseline = "middle"; g.textAlign = "left";
    L.rows.forEach((row, r) => {
      const cy = L.top0 + r * L.rowH + L.rowH / 2;
      for (const it of row) {
        if (it.kind === "box") { g.fillStyle = it.color; g.fillRect(it.x, cy - L.sh / 2, L.sw, L.sh); }
        else {
          const lw = it.lw || 1.5;
          g.strokeStyle = it.color; g.lineWidth = lw * pt; g.lineCap = "butt";
          g.setLineDash(it.dash ? dashPt(lw).map(v => v * pt) : []);
          g.beginPath(); g.moveTo(it.x, cy); g.lineTo(it.x + it.mark, cy); g.stroke(); g.setLineDash([]);
        }
        g.fillStyle = INK; g.font = L.font;
        g.fillText(it.name, it.x + it.mark + L.gapIn, cy);
      }
    });
    const numFont = `${axisPt * pt}px ${NUM}`, unitFont = `${axisPt * pt}px ${CJK}`;
    let top = L.height + Math.max(0.45 * L.fpt, 0.6 * axisPt) * pt;
    // 兩軸的單位標在圖的左上、右上
    g.font = unitFont; g.fillStyle = TEXT2; g.textBaseline = "top";
    g.textAlign = "left"; g.fillText(axisUnit("L"), L.padX, top - 0.2 * axisPt * pt);
    if (dual) { g.textAlign = "right"; g.fillText(axisUnit("R"), pxW - L.padX, top - 0.2 * axisPt * pt); }
    top += 1.5 * axisPt * pt;
    const bottom = pxH - 1 * pt - 1.7 * axisPt * pt, ph = bottom - top;

    const maxTicks = Math.max(2, Math.floor(ph / (axisPt * pt * 1.5)) + 1);
    const nextNice = st => { const mag = Math.pow(10, Math.floor(Math.log10(st) + 1e-9)), n = Math.round(st / mag); return (n < 2 ? 2 : n < 5 ? 5 : 10) * mag; };
    function scale(ax, manual, snap) {
      const d = axisData(ax);
      const mLo = manual[0] !== null, mHi = manual[1] !== null;
      const pad = (d.hi - d.lo) * 0.04;
      let lo = mLo ? manual[0] : d.zero && d.lo >= 0 ? 0 : d.lo - pad, hi = mHi ? manual[1] : d.hi + pad;
      if (hi <= lo) hi = lo + (Math.abs(lo) || 1) * 0.1;
      const cnt = st => Math.floor(hi / st + 1e-6) - Math.ceil(lo / st - 1e-6) + 1;
      let step = niceStep(hi - lo);
      for (let guard = 0; guard < 12 && cnt(step) > maxTicks; guard++) step = nextNice(step);
      const span = hi - lo, loT = Math.floor(lo / step + 1e-6) * step, hiT = Math.ceil(hi / step - 1e-6) * step;
      if (!mLo && (snap || lo - loT <= span * 0.12)) lo = loT;
      if (!mHi && (snap || hiT - hi <= span * 0.12)) hi = hiT;
      const ticks = [];
      for (let v = Math.ceil(lo / step - 1e-6) * step; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
      return withFmt({ lo, hi, ticks, dec: decOf(step) }, d.unit);
    }
    const withFmt = (sc, unit) => ({ ...sc, fmt: v => unit === "億美元" ? fmtAmt(v, sc.dec) : unit === "%" ? v.toFixed(sc.dec) + "%" : v.toFixed(sc.dec) });
    const auto = [...yRange.comboL, ...yRange.comboR].every(v => v === null);
    const SL = scale("L", yRange.comboL, dual && auto);
    const SR = !dual ? null : auto ? withFmt(alignedScale(SL.ticks.length - 1, axisData("R")), axisUnit("R")) : scale("R", yRange.comboR, false);
    g.font = numFont;
    const wOf = sc => sc ? Math.max(...sc.ticks.map(v => g.measureText(sc.fmt(v)).width), 0) : 0;
    const gapX = 0.4 * axisPt * pt;
    const plot = { l: L.padX + wOf(SL) + gapX, r: dual ? pxW - L.padX - wOf(SR) - gapX : pxW - 4 * pt, t: top, b: bottom };
    const pw = plot.r - plot.l;
    const Y = (sc, v) => plot.t + (sc.hi - v) / (sc.hi - sc.lo) * ph;
    const band = pw / comboRows.length, cx = i => plot.l + band * i + band / 2;

    g.fillStyle = TEXT2; g.textBaseline = "middle";
    g.textAlign = "right"; for (const v of SL.ticks) g.fillText(SL.fmt(v), plot.l - gapX, Y(SL, v));
    if (SR) { g.textAlign = "left"; for (const v of SR.ticks) g.fillText(SR.fmt(v), plot.r + gapX, Y(SR, v)); }
    g.strokeStyle = GRID; g.lineWidth = 0.75 * pt;
    for (const v of SL.ticks) { if (v === 0) continue; const yy = Math.round(Y(SL, v)) + 0.5; g.beginPath(); g.moveTo(plot.l, yy); g.lineTo(plot.r, yy); g.stroke(); }

    g.save();
    g.beginPath(); g.rect(plot.l, plot.t, pw, ph); g.clip();
    const bars = combo.map((x, i) => [x, i]).filter(([x]) => x.type === "bar");
    if (bars.length) {
      const gw = band * 0.72, bw = gw / bars.length, gp = bw > 3 * pt ? Math.round(0.3 * pt) : 0;
      comboRows.forEach((r, i) => bars.forEach(([x, k], j) => {
        const v = r.vals[k]; if (!okNum(v)) return;
        const sc = axisOf(x) === "L" ? SL : SR, base = Math.max(sc.lo, Math.min(sc.hi, 0));
        const y0 = Y(sc, Math.max(v, base)), y1 = Y(sc, Math.min(v, base));
        g.fillStyle = exportColor(k + 1);
        g.fillRect(cx(i) - gw / 2 + j * bw + gp / 2, y0, Math.max(1, bw - gp), Math.max(0, y1 - y0));
      }));
    }
    g.strokeStyle = AXIS; g.lineWidth = 0.75 * pt;
    if (SL.lo < 0 && SL.hi > 0) { const yy = Math.round(Y(SL, 0)) + 0.5; g.beginPath(); g.moveTo(plot.l, yy); g.lineTo(plot.r, yy); g.stroke(); }
    if (SR && SR.lo < 0 && SR.hi > 0) {
      const yy = Math.round(Y(SR, 0)) + 0.5;
      g.setLineDash([3 * pt, 2 * pt]); g.beginPath(); g.moveTo(plot.l, yy); g.lineTo(plot.r, yy); g.stroke(); g.setLineDash([]);
    }
    combo.forEach((x, k) => {
      if (x.type !== "line") return;
      const sc = axisOf(x) === "L" ? SL : SR;
      g.strokeStyle = exportColor(k + 1); g.lineWidth = 1.5 * pt; g.lineJoin = "round"; g.lineCap = "round";
      g.beginPath();
      let pen = false;
      comboRows.forEach((r, i) => { const v = r.vals[k]; if (!okNum(v)) { pen = false; return; } if (pen) g.lineTo(cx(i), Y(sc, v)); else g.moveTo(cx(i), Y(sc, v)); pen = true; });
      g.stroke();
    });
    g.restore();
    if (!(SL.lo < 0 && SL.hi > 0)) {
      g.strokeStyle = AXIS; g.lineWidth = 0.75 * pt;
      const yb = Math.round(SL.lo >= 0 ? plot.b : plot.t) + 0.5;
      g.beginPath(); g.moveTo(plot.l, yb); g.lineTo(plot.r, yb); g.stroke();
    }
    g.font = numFont; g.fillStyle = TEXT2; g.textBaseline = "top";
    const lab = t => { const [yy, mm] = DATA.months[t].split("-"); return `${yy}/${+mm}`; };
    const need = g.measureText("2026/12").width + 0.8 * axisPt * pt;
    const every = [1, 2, 3, 4, 6, 12, 24, 36, 60, 120].find(k => k * band >= need) || 120;
    const startI = every >= 12 ? Math.max(0, comboRows.findIndex(r => DATA.months[r.t].endsWith("-01"))) : 0;
    for (let i = startI; i < comboRows.length; i += every) {
      const text = lab(comboRows[i].t), w = g.measureText(text).width;
      let xx = cx(i), align = "center";
      if (xx - w / 2 < 0) { xx = 0; align = "left"; } else if (xx + w / 2 > pxW) { xx = pxW; align = "right"; }
      g.textAlign = align;
      g.fillText(text, xx, plot.b + 0.65 * axisPt * pt);
    }
    return { cv, legendPt: L.fpt, axisPt, share: L.height / pxH, plotShare: ph / pxH, pxW, pxH, dual, lo: SL.lo, hi: SL.hi, lo2: SR ? SR.lo : null, hi2: SR ? SR.hi : null };
  }

  function buildComboCsv() {
    const [a, z] = rangeBounds();
    const q = v => /[",\r\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const lines = [
      ["Retail Sales Driver：組合圖"],
      ["單位：金額為億美元（季節調整、名目）；年增率、月增率為 %（季調數字計算）"],
      [`資料來源：U.S. Census Bureau, Advance Monthly Retail Trade Survey（${DATA.vintage}）；最新月份為初值`],
      [],
      ["月份", ...combo.map(x => `${name(x.id)}${MEASURE_WORD[x.m]}（${unitOf(x.m)}）`), "備註"],
    ];
    for (let t = a; t <= z; t++) {
      lines.push([DATA.months[t], ...combo.map(x => { const v = comboValue(x, t); return !okNum(v) ? "" : x.m === "level" ? v.toFixed(2) : v.toFixed(4); }), t === ADV ? "初值" : ""]);
    }
    return "﻿" + lines.map(r => r.map(q).join(",")).join("\r\n") + "\r\n";
  }

  // ---------- 組合圖面板：加入項目、序列清單 ----------
  const ccExpanded = new Set(["TOTAL"]);
  function renderComboTree() {
    const box = $("cc-tree"), scroll = box.scrollTop, q = $("cc-search").value.trim().toLowerCase();
    let show = null;
    if (q) {
      show = new Set();
      (function walk(ids, up) {
        for (const k of ids) { const chain = [...up, k]; if (matches(k, q)) chain.forEach(c => show.add(c)); walk(kidsOf(k), chain); }
      })(["TOTAL"], []);
    }
    const full = combo.length >= MAX_SERIES;
    const row = (k, depth, hasKids, open) => {
      const has = combo.some(x => x.id === k && x.m === addMeasure);
      const why = has ? `已加入${MEASURE_WORD[addMeasure]}` : full ? `最多 ${MAX_SERIES} 條` : "";
      return `<div class="cp-node" role="treeitem"${hasKids ? ` aria-expanded="${open}"` : ""} style="padding-left:${depth * 18}px">` +
        (hasKids ? `<button type="button" class="cp-tog" id="cc-tog-${k}" data-tog="${k}" aria-label="${open ? "收合" : "展開"} ${esc(name(k))}">${open ? "▾" : "▸"}</button>` : `<span class="cp-tog-sp"></span>`) +
        `<button type="button" class="cc-add-btn" id="cc-add-${k}" data-add="${k}" ${why ? "disabled" : ""} aria-label="加入 ${esc(name(k))} 的${MEASURE_WORD[addMeasure]}"><span class="plus" aria-hidden="true">＋</span><span>${esc(name(k))}</span><small>${why ? esc(why) + " · " : ""}${esc(pickCode(k))}</small></button></div>`;
    };
    const rows = [];
    (function walk(ids, depth) {
      for (const k of ids) {
        if (show && !show.has(k)) continue;
        const hasKids = kidsOf(k).length > 0, open = hasKids && (show ? true : ccExpanded.has(k));
        rows.push(row(k, depth, hasKids, open));
        if (open) walk(kidsOf(k), depth + 1);
      }
    })(["TOTAL"], 0);
    const special = S.picker.special.filter(k => !q || matches(k, q)).map(k => row(k, 0, false, false));
    if (special.length) rows.push(`<div class="cp-group" role="none">特殊分類（Census 公布的彙總序列）</div>`, ...special);
    box.innerHTML = rows.length ? rows.join("") : `<p class="hint">找不到符合「${esc(q)}」的項目</p>`;
    box.scrollTop = scroll;
  }
  function renderComboPanel() {
    $("cc-measure").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === addMeasure)));
    renderComboTree();
    $("cc-count").textContent = `已加入 ${combo.length} / ${MAX_SERIES} 條序列 · 並排的柱子依清單順序由左到右`;
    const opt = (pairs, v) => pairs.map(([k, t]) => `<option value="${k}" ${k === v ? "selected" : ""}>${t}</option>`).join("");
    $("cc-list").innerHTML = combo.length ? combo.map((x, i) => `<li>
        <i class="${x.type === "line" ? "ln" : ""}" style="background:${seriesColor(i)}"></i>
        <span>${esc(name(x.id))}<small>${esc(pickCode(x.id))}</small></span>
        <span class="cp-btns">
          <button type="button" id="cc-up-${i}" data-cmove="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="${esc(seriesLabel(x))} 往前移">↑</button>
          <button type="button" id="cc-down-${i}" data-cmove="${i}" data-dir="1" ${i === combo.length - 1 ? "disabled" : ""} aria-label="${esc(seriesLabel(x))} 往後移">↓</button>
          <button type="button" id="cc-del-${i}" data-cdel="${i}" aria-label="移除 ${esc(seriesLabel(x))}">✕</button>
        </span>
        <span class="cc-opts">
          <select id="cc-m-${i}" data-ci="${i}" data-f="m" aria-label="${esc(name(x.id))} 的數值種類">${opt([["level", "金額"], ["yoy", "年增率"], ["mom", "月增率"]], x.m)}</select>
          <select id="cc-t-${i}" data-ci="${i}" data-f="type" aria-label="${esc(name(x.id))} 畫成柱或線">${opt([["bar", "柱"], ["line", "線"]], x.type)}</select>
          <select id="cc-a-${i}" data-ci="${i}" data-f="axis" aria-label="${esc(name(x.id))} 放在哪一軸">${opt([["L", "左軸"], ["R", "右軸"]], x.axis)}</select>
        </span>
      </li>`).join("") : `<li><p class="cp-empty">還沒有序列。先選「新增時使用」的數值種類，再從左邊點項目加入，或點下面的範例。</p></li>`;
    const mixed = mixedAxes();
    $("cc-warn").hidden = !mixed.length;
    if (mixed.length) $("cc-warn").textContent = `${mixed.map(a => a === "L" ? "左軸" : "右軸").join("、")}同時有金額與變動率，單位不同、刻度會失真。建議把金額和變動率分放左右兩軸。`;
    $("cc-examples").innerHTML = COMBO_EXAMPLES.map((ex, k) => `<button type="button" class="dl-btn" id="cc-ex-${k}" data-example="${k}">${esc(ex.label)}</button>`).join("");
    $("cc-clear").disabled = !combo.length;
  }
  const comboChanged = () => { saveCombo(); render(); };
  $("cp-kind").addEventListener("click", e => {
    const b = e.target.closest("[data-kind]"); if (!b) return;
    state.customKind = b.dataset.kind;
    saveCombo(); syncHash(); render();
  });
  $("cc-measure").addEventListener("click", e => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    addMeasure = b.dataset.m; saveCombo(); renderComboPanel();
  });
  $("cc-tree").addEventListener("click", e => {
    const tg = e.target.closest("[data-tog]");
    if (tg) {
      const id = tg.dataset.tog;
      if (ccExpanded.has(id)) ccExpanded.delete(id); else ccExpanded.add(id);
      renderComboTree();
      if ($(`cc-tog-${id}`)) $(`cc-tog-${id}`).focus();
      return;
    }
    const ad = e.target.closest("[data-add]");
    if (ad && !ad.disabled) {
      setCombo([...combo, { id: ad.dataset.add, m: addMeasure, ...defaultsFor(addMeasure) }]);
      render();
      if ($(`cc-add-${ad.dataset.add}`)) $(`cc-add-${ad.dataset.add}`).focus();
    }
  });
  let ccTimer = 0;
  $("cc-search").addEventListener("input", () => { clearTimeout(ccTimer); ccTimer = setTimeout(renderComboTree, 150); });
  $("cc-list").addEventListener("click", e => {
    const mv = e.target.closest("[data-cmove]"), del = e.target.closest("[data-cdel]");
    if (mv) {
      const i = +mv.dataset.cmove, j = i + +mv.dataset.dir;
      if (j < 0 || j >= combo.length) return;
      [combo[i], combo[j]] = [combo[j], combo[i]];
      comboChanged();
    } else if (del) { combo.splice(+del.dataset.cdel, 1); comboChanged(); }
  });
  $("cc-list").addEventListener("change", e => {
    const sel = e.target.closest("select[data-ci]"); if (!sel) return;
    const i = +sel.dataset.ci, f = sel.dataset.f, x = combo[i];
    if (f === "m") {
      if (combo.some((y, j) => j !== i && y.id === x.id && y.m === sel.value)) { render(); return; }   // 已經有同一種數值
      x.m = sel.value; Object.assign(x, defaultsFor(x.m));        // 換數值種類時，柱或線、左右軸回到預設
    } else x[f] = sel.value;
    comboChanged();
  });
  $("cc-examples").addEventListener("click", e => {
    const b = e.target.closest("[data-example]"); if (!b) return;
    setCombo(COMBO_EXAMPLES[+b.dataset.example].s.map(toSeries));
    render();
  });
  $("cc-clear").addEventListener("click", () => { setCombo([]); render(); });

  // ---------- 組合圖的頭條、圖例、明細表 ----------
  function renderComboReading() {
    const t = state.t;
    $("focus-name").innerHTML = `組合圖<small>${combo.length} 條序列${combo.length ? (comboDual() ? ` · 左軸 ${axisUnit("L")} · 右軸 ${axisUnit("R")}` : ` · ${axisUnit("L")}`) : ""}</small>`;
    if (!combo.length) {
      $("hero-label").textContent = `組合圖 · ${monthLabel(t)}${advTag(t)}`;
      $("hero-num").textContent = "–"; $("hero-delta").textContent = "";
      $("stats").innerHTML = "";
      $("story").innerHTML = "還沒有序列，請在上方「組合圖」加入項目。";
      return;
    }
    const x0 = combo[0], v = comboValue(x0, t);
    $("hero-label").textContent = `${seriesLabel(x0)} · ${monthLabel(t)}${advTag(t)}`;
    $("hero-num").innerHTML = !okNum(v) ? "–" : x0.m === "level" ? `${fmtAmt(v)}<small>億美元</small>` : `${v.toFixed(2)}<small>%</small>`;
    $("hero-delta").innerHTML = `上月 <b>${fmtSeries(x0, comboValue(x0, t - 1))}</b> · 去年同月 <b>${fmtSeries(x0, comboValue(x0, t - 12))}</b>`;
    $("stats").innerHTML = combo.slice(0, 3).map(x => {
      const w = comboValue(x, t);
      return `<div class="stat"><span>${esc(name(x.id))} ${MEASURE_WORD[x.m]}</span><b>${!okNum(w) ? "—" : x.m === "level" ? fmtAmt(w) : signed(w, 2) + "%"}</b>${x.m === "level" ? "<small>億美元</small>" : ""}</div>`;
    }).join("");
    const mixed = mixedAxes();
    $("story").innerHTML = mixed.length
      ? `<b>注意：</b>${mixed.map(a => a === "L" ? "左軸" : "右軸").join("、")}同時有金額與變動率，單位不同，建議分放左右兩軸。`
      : `大數字是清單第一條序列。${combo.length > 3 ? `全部 ${combo.length} 條序列的數字在下方明細表。` : ""}在上方清單可以調整每條序列的數值種類、柱或線、左右軸。`;
  }
  function renderComboChrome() {
    $("crumbs").innerHTML = `<span class="here" aria-current="page">自訂 · 組合圖</span>`;
    const units = !combo.length ? "" : comboDual() ? `左軸 ${axisUnit("L")}，右軸 ${axisUnit("R")}` : `單位：${axisUnit("L")}`;
    $("chart-title").innerHTML = `組合圖${units ? `<em>${esc(units)}</em>` : ""}`;
    $("chart-hint").textContent = "點圖上任一處切換月份；最新月份是初值（柱子顏色較淡）";
    $("legend").innerHTML = combo.map((x, i) => `<span class="lg-static"><i class="${x.type === "line" ? "ln" : ""}" style="background:${seriesColor(i)}"></i>${esc(seriesLabel(x))}</span>`).join("");
  }
  function renderComboLedger() {
    const t = state.t;
    $("ledger-title").innerHTML = `${monthLabel(t)}${advTag(t)} · 組合圖各序列<em>本月、上月與去年同月</em>`;
    const head = `<div class="row head" role="row"><span role="columnheader">序列</span><span class="num c-w" role="columnheader">去年同月</span><span class="num c-w" role="columnheader">上月</span><span class="num" role="columnheader">本月</span><span class="num" role="columnheader">較上月</span></div>`;
    const body = combo.map((x, i) => {
      const cur = comboValue(x, t), prev = comboValue(x, t - 1), ya = comboValue(x, t - 12);
      const diff = okNum(cur) && okNum(prev) ? cur - prev : null;
      const dtxt = diff === null ? "—" : x.m === "level" ? `${signed(diff, 1)} 億美元` : `${signed(diff, 2)} 個百分點`;
      return `<div class="row" role="row">
        <span class="name" role="cell"><i class="${x.type === "line" ? "ln" : ""}" style="background:${seriesColor(i)}${x.type === "line" ? ";height:3px" : ""}"></i><span>${esc(name(x.id))} ${MEASURE_WORD[x.m]}<small>${esc(pickCode(x.id))} · ${x.type === "bar" ? "柱" : "線"} · ${axisOf(x) === "L" ? "左軸" : "右軸"}</small></span></span>
        <span class="num dim c-w" role="cell">${fmtSeries(x, ya, false)}</span>
        <span class="num dim c-w" role="cell">${fmtSeries(x, prev, false)}</span>
        <span class="num" role="cell">${fmtSeries(x, cur, false)}</span>
        <span class="num dim" role="cell">${dtxt}</span>
      </div>`;
    }).join("");
    $("ledger").innerHTML = head + (body || `<div class="row" role="row"><span class="name" role="cell"><span>還沒有序列</span></span></div>`) +
      `<p class="hint" style="margin:8px 6px 0">金額的單位是億美元；年增率、月增率的單位是 %，較上月為百分點。</p>`;
  }

  // ---------- 明細表 ----------
  function renderLedger(snap, plan) {
    const lv = isLevel(), custom = snap.custom, restOn = custom && !state.customOnly;
    const vals = snap.rows.map(r => r.value).concat(restOn ? [snap.rest.value] : []);
    const d = decFor(vals);
    const list = [...snap.rows].sort(state.sort === "contrib" ? (a, b) => b.value - a.value : (a, b) => a.order - b.order);
    const max = Math.max(...vals.map(Math.abs), 1e-12);
    $("ledger-title").innerHTML = `${monthLabel(state.t)}${advTag(state.t)} · ${esc(name(state.node))}${custom ? "各項目" : " 底下各項目"}<em>${lv ? "季調銷售額，億美元" : `對整體零售${chgWord()}的貢獻，百分點`}</em>`;
    const chgHead = lv ? "月增率" : `自身${chgWord()}`;
    const head = `<div class="row head" role="row"><span role="columnheader">項目</span><span class="num c-w" role="columnheader">占整體零售</span><span class="num c-chg" role="columnheader">${chgHead}</span><span role="columnheader" aria-hidden="true"></span><span class="num" role="columnheader">${lv ? "億美元" : "貢獻"}</span></div>`;
    const bar = (v, color) => {
      const half = Math.abs(v) / max * (lv ? 100 : 50);
      if (lv) return `<i class="pos" style="left:0;width:${half}%;background:${color}"></i>`;
      return v >= 0 ? `<i class="pos" style="left:50%;width:${half}%;background:${color}"></i>` : `<i class="neg" style="left:${50 - half}%;width:${half}%;background:${color}"></i>`;
    };
    const fmtW = w => `${w.toFixed(Math.abs(w) < 1 ? 2 : 1)}%`;
    const cell = r => `<span class="num dim c-w" role="cell">${fmtW(r.share)}</span><span class="num dim c-chg" role="cell">${fmtPct(r.change, lv || state.mode === "mom" ? 2 : 1)}</span>`;
    const body = list.map(r => {
      const color = plan.map.get(r.id), off = hiddenSet().has(r.id);
      const sub = `<span class="en">${esc(r.en)} · </span>${esc(codeOf(r.id))}${!isLeaf(r.id) ? ` · ${kidsOf(r.id).length} 個子項` : ""}${off ? " · 圖上已併入「其他」" : ""}`;
      return `<div class="row${r.drill ? " drillable" : ""}${off ? " muted" : ""}" role="row" ${r.drill ? `tabindex="0" data-id="${r.id}" aria-label="${custom ? `到${openWhere(r.id)}查看` : "展開"} ${esc(r.name)}"` : ""}>
        <span class="name" role="cell"><i style="background:${color}"></i><span>${esc(r.name)}<small>${sub}</small></span>${r.drill ? '<span class="chev" aria-hidden="true">›</span>' : ""}</span>
        ${cell(r)}
        <span class="bar${lv ? " lv" : ""}" role="cell" aria-hidden="true">${bar(r.value, color)}</span>
        <span class="num" role="cell">${fmtVal(r.value, d)}</span>
      </div>`;
    }).join("");
    const totalRow = (label, r, cls = "total") => `<div class="row ${cls}" role="row"><span class="name" role="cell"><span>${esc(label)}</span></span>${cell(r)}<span role="cell"></span><span class="num" role="cell">${fmtVal(r.value, d)}</span></div>`;
    let foot = "";
    if (custom) {
      if (state.customOnly) foot = totalRow("所選項目合計", snap.node);
      else {
        foot = `<div class="row" role="row"><span class="name" role="cell"><i style="background:var(--other)"></i><span>其他（未選項目）<small>整體零售裡其餘所有項目</small></span></span>${cell(snap.rest)}<span class="bar${lv ? " lv" : ""}" role="cell" aria-hidden="true">${bar(snap.rest.value, "var(--other)")}</span><span class="num" role="cell">${fmtVal(snap.rest.value, d)}</span></div>` +
          totalRow("零售及餐飲服務總計", snap.total);
      }
    } else {
      foot = totalRow(`${name(state.node)}${state.node === TOTAL ? "" : " 合計"}`, snap.node);
      if (state.node !== TOTAL) foot += totalRow("參考：零售及餐飲服務總計", snap.total, "ref");
    }
    $("ledger").innerHTML = head + body + foot;
  }
  const openRow = id => state.view === "custom" ? openInView(id) : drillTo(id);
  $("ledger").addEventListener("click", e => { const r = e.target.closest(".row.drillable"); if (r) openRow(r.dataset.id); });
  $("ledger").addEventListener("keydown", e => {
    const r = e.target.closest(".row.drillable");
    if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openRow(r.dataset.id); }
  });

  function chartTitleText() {
    return `${name(state.node)}${state.view === "custom" ? "各項目" : " 底下各項目"}${isLevel() ? "的季調銷售額（億美元）" : `對整體零售${chgWord()}的貢獻（百分點）`}`;
  }
  function renderChrome(plan) {
    const path = state.view === "custom" ? [CUSTOM] : pathTo(state.node);
    const crumb = id => id === CUSTOM ? "自訂" : id === rootId() ? viewObj().label : name(id);
    $("crumbs").innerHTML = path.map((id, k) => k === path.length - 1
      ? `<span class="here" aria-current="page">${esc(crumb(id))}</span>`
      : `<button type="button" data-id="${id}">${esc(crumb(id))}</button><span class="sep" aria-hidden="true">›</span>`).join("");
    $("chart-title").innerHTML = `${esc(name(state.node))}${state.view === "custom" ? "各項目" : " 底下各項目"}<em>${isLevel() ? "季調銷售額，億美元" : `對整體零售${chgWord()}的貢獻，百分點`}</em>`;
    const anyDrill = segMeta.some(s => s.drill);
    const adv = "；最新月份是初值（顏色較淡）";
    $("chart-hint").textContent = (state.view === "custom" ? "點色塊會切到對應的指標查看該項，點圖例可隱藏項目" : anyDrill ? "點色塊往下展開，點空白處切換月份，點圖例可隱藏項目" : "這一層都是最細項目；點柱子切換月份，點圖例可隱藏項目") + adv;
    const kids = kidsOf(state.node), hid = hiddenSet();
    const other = segMeta.find(s => s.key === "other");
    const parts = [];
    if (other) parts.push(`<span class="lg-static"><i style="background:var(--other)"></i>${esc(other.name)}</span>`);
    for (const k of [...kids].reverse()) {
      const on = !hid.has(k);
      parts.push(`<button type="button" class="lg" data-key="${k}" aria-pressed="${on}" title="${on ? "點一下隱藏，併入「其他」" : "點一下重新顯示"}"><i style="background:${plan.map.get(k)}"></i>${esc(name(k))}</button>`);
    }
    parts.push(`<button type="button" class="lg" data-key="line" aria-pressed="${lineShown()}" title="點一下隱藏或顯示總計線"><i class="line-key"></i>${esc(lineName())}</button>`);
    if (hid.size || lineByLevel.has(lineKey())) parts.push(`<button type="button" class="lg-reset" id="lg-reset">全部恢復</button>`);
    $("legend").innerHTML = parts.join("");
  }
  function toggleItem(key) {
    if (key === "line") lineByLevel.set(lineKey(), !lineShown());
    else { const hid = hiddenSet(); if (hid.has(key)) hid.delete(key); else hid.add(key); }
    render();
  }
  $("legend").addEventListener("click", e => {
    if (e.target.closest("#lg-reset")) { hiddenSet().clear(); lineByLevel.delete(lineKey()); render(); return; }
    const b = e.target.closest("button.lg");
    if (b) toggleItem(b.dataset.key);
  });

  function render() {
    if (state.t < firstValid()) state.t = firstValid();
    syncControls();
    $("custom-panel").hidden = state.view !== "custom";
    $("ledger").classList.toggle("combo", isCombo());
    $("sortbar").hidden = isCombo();
    if (isCombo()) {
      comboData();
      renderComboReading();
      renderComboChrome();
      drawChart();
      renderComboLedger();
      renderCustomPanel(null);
      if (!$("export-panel").hidden) renderExportPanel();
      return;
    }
    const plan = colorPlan(state.node);
    const snap = snapshot(state.t);
    chartSeries(plan);
    renderReading(snap);
    renderChrome(plan);
    drawChart();
    renderLedger(snap, plan);
    $("custom-panel").hidden = state.view !== "custom";
    if (state.view === "custom") renderCustomPanel(plan);
    if (!$("export-panel").hidden) renderExportPanel();
  }

  $("vintage").textContent = DATA.vintage;
  if (DATA.source === "file") $("source-note").textContent = "資料來自手動下載的 Census MARTS 整包資料（MARTS-mf.zip）。排程恢復正常後會自動改回自動更新。";
  if (DATA.source === "api") $("source-note").textContent = "資料來自 Census Data API（timeseries/eits/marts）。整包下載暫時無法使用，排程自動改用 API。";
  // 下次發布：Census 公布的日期，美東 8:30，換算成台北時間
  (function () {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(DATA.nextRelease || "");
    if (!m) return;
    let when = null;
    try {
      for (const h of [12, 13]) {   // 夏令時間 12:30 UTC，標準時間 13:30 UTC
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], h, 30));
        const etHour = +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(d);
        if (etHour === 8) { when = d; break; }
      }
    } catch (e) { when = null; }
    const el = $("next-release");
    if (when) {
      if (when.getTime() < Date.now()) return;
      const f = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      el.textContent = `下次發布：${f.format(when)}（台北）`;
    } else el.textContent = `下次發布：${+m[1]}/${+m[2]}/${+m[3]}（美東 8:30）`;
    el.hidden = false;
  })();
  let lastW = 0;
  new ResizeObserver(() => {
    const w = $("chart").clientWidth;
    if (w && w !== lastW) { lastW = w; drawChart(); }
  }).observe($("chart"));
  window.addEventListener("hashchange", () => { readHash(); render(); });
  readHash();
  render();
})();
