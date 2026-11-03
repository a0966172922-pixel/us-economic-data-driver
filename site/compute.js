// PCE Driver 計算核心
// items：每個項目有 price[]（價格指數）與 spend[]（名目支出；淨額中的 "Less:" 項為負值）
// 方法：連鎖 Fisher 指數 + BEA 採用的 Fisher 加法拆解，月貢獻加總精確等於合成指數的月變動；
//       年貢獻由 12 個月的月貢獻依累積指數水準加權串接，加總精確等於合成指數的年增率。
function buildModel(items, T) {
  const idx = new Array(T).fill(NaN);
  const momC = items.map(() => new Float64Array(T));
  idx[0] = 100;
  for (let t = 1; t < T; t++) {
    let e0 = 0, e1 = 0, lNum = 0, pDen = 0;
    for (const c of items) {
      const r = c.price[t] / c.price[t - 1];
      e0 += c.spend[t - 1];
      e1 += c.spend[t];
      lNum += c.spend[t - 1] * r;
      pDen += c.spend[t] / r;
    }
    const F = Math.sqrt((lNum / e0) * (e1 / pDen)); // Fisher 價格相對數
    const FQ = (e1 / e0) / F;                         // Fisher 數量相對數
    let den = 0;
    const w = new Float64Array(items.length);
    items.forEach((c, i) => {
      w[i] = c.spend[t - 1] / c.price[t - 1] + (c.spend[t] / c.price[t]) / FQ;
      den += w[i] * c.price[t - 1];
    });
    items.forEach((c, i) => { momC[i][t] = w[i] * (c.price[t] - c.price[t - 1]) / den; });
    idx[t] = idx[t - 1] * F;
  }
  return { items, idx, momC, T };
}

// 某一期的合成指數變動與各項目貢獻（單位：%、百分點）
function changeAt(model, t, mode) {
  const { items, idx, momC } = model;
  if (mode === "mom") {
    if (t < 1) return null;
    return {
      total: (idx[t] / idx[t - 1] - 1) * 100,
      contrib: items.map((c, i) => momC[i][t] * 100),
    };
  }
  if (t < 12) return null;
  const base = idx[t - 12];
  const scale = [];
  for (let k = t - 11; k <= t; k++) scale.push(idx[k - 1] / base);
  return {
    total: (idx[t] / base - 1) * 100,
    contrib: items.map((c, i) => {
      let s = 0;
      for (let k = t - 11, j = 0; k <= t; k++, j++) s += scale[j] * momC[i][k];
      return s * 100;
    }),
  };
}

// 單一序列的變動率
function pctChange(series, t, mode) {
  const lag = mode === "mom" ? 1 : 12;
  return (series[t] / series[t - lag] - 1) * 100;
}

if (typeof module !== "undefined") module.exports = { buildModel, changeAt, pctChange };
