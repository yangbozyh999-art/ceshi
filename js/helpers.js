/* 公共工具：DOM、计时（performance.now）、统计、信号检测论 */

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* performance.now 计时器：stimulus 呈现时调用 start，响应时调用 take */
export function makeClock() {
  const t0 = performance.now();
  return { start: () => performance.now(), take: (t) => Math.round(performance.now() - t) };
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export function median(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(arr) {
  return arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null;
}

export function sd(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

/* 反应时变异系数 CV = SD / Mean（保留 4 位小数） */
export function cv(arr) {
  const m = mean(arr), s = sd(arr);
  return m && s !== null ? +(s / m).toFixed(4) : null;
}

/* 逆正态（probit）近似 —— Peter Acklam 算法，最大误差 ~1.15e-9，用于 d' 计算 */
export function zOf(p) {
  p = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/* d'（log-linear 校正，避免 0/1 概率导致无穷大） */
export function dprime(hits, nTargets, fas, nNonTargets) {
  const pH = (hits + 0.5) / (nTargets + 1);
  const pF = (fas + 0.5) / (nNonTargets + 1);
  return +(zOf(pH) - zOf(pF)).toFixed(2);
}

/* 线性映射到 0-100：输入 x 在 [lo, hi] 之间，lo→hiScore, hi→loScore */
export function scaleScore(x, lo, hi, loScore = 0, hiScore = 100) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return Math.round(hiScore + t * (loScore - hiScore));
}

export const clamp100 = (v) => v === null ? null : Math.round(Math.min(Math.max(v, 0), 100));

/* 下载文件 */
export function download(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
