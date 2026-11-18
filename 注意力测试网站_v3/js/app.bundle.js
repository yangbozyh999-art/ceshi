/* ⚠️ 本文件由 build.js 自动生成，请勿手改；源码在 js/ 目录 */
window.__tasks = window.__tasks || {};
window.addEventListener("error", function (e) {
  var d = document.getElementById("js-error");
  if (!d) return;
  var msg = e.message || "unknown";
  /* 预览沙箱 / 跨源环境下浏览器会把错误抹成 "Script error. (@:0)"，无任何定位信息，
   * 对访客毫无价值还造成恐慌，此类噪音不显示（console 仍可见）。 */
  if (msg === "Script error." && !e.filename && !e.lineno) return;
  d.hidden = false;
  d.textContent = "⚠️ 脚本错误：" + msg + " (@" + String(e.filename || "").split("/").pop() + ":" + e.lineno + ")";
});
window.addEventListener("unhandledrejection", function (e) {
  var d = document.getElementById("js-error");
  var r = e.reason && e.reason.message ? e.reason.message : String(e.reason || "unknown");
  if (d) { d.hidden = false; d.textContent = "⚠️ 异步错误：" + r; }
});


/* ===== js/helpers.js ===== */
/* 公共工具：DOM、计时（performance.now）、统计、信号检测论 */

const $ = (sel, root = document) => root.querySelector(sel);

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function median(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(arr) {
  return arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null;
}

function sd(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

/* 反应时变异系数 CV = SD / Mean（保留 4 位小数） */
function cv(arr) {
  const m = mean(arr), s = sd(arr);
  return m && s !== null ? +(s / m).toFixed(4) : null;
}

/* 逆正态（probit）近似 —— Peter Acklam 算法，最大误差 ~1.15e-9，用于 d' 计算 */
function zOf(p) {
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
function dprime(hits, nTargets, fas, nNonTargets) {
  const pH = (hits + 0.5) / (nTargets + 1);
  const pF = (fas + 0.5) / (nNonTargets + 1);
  return +(zOf(pH) - zOf(pF)).toFixed(2);
}

const clamp100 = (v) => v === null ? null : Math.round(Math.min(Math.max(v, 0), 100));

/* 下载文件 */
function download(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- 任务清理钩子 ----------
 * 任务模块把 setInterval / document 事件监听等注册进来，
 * 切换步骤或离开测试页时统一回收，避免定时器与监听残留。 */
const __cleanups = [];
function onCleanup(fn) {
  if (typeof fn === "function") __cleanups.push(fn);
}
function runCleanups() {
  while (__cleanups.length) {
    const fn = __cleanups.pop();
    try { fn(); } catch (e) { /* 清理失败不影响流程 */ }
  }
}


/* ===== js/versions.js ===== */
/* ==================== 三档测试版本配置（唯一真源） ====================
 * 三个版本共用同一套任务组件，只在这里通过参数控制试次数 / 时长 / 难度。
 * 任务组件通过 ctx.cfg 读取本文件 params（见 app.js 的 taskCtx）。
 * 新增版本或调整强度：只改本文件，不改任务代码。 */
const VERSIONS = {
  quick: {
    id: "quick",
    name: "快速版",
    minutes: 5,
    timeLabel: "约 5 分钟",
    reliability: "较低",
    reliabilityShort: "样本较少，仅供参考",
    tag: "尝鲜首选",
    summary: "试次精简，适合先体验流程、看看自己大概在什么水平。",
    covers: "反应速度、选择性注意、持续注意（粗略）",
    scenes: "碎片时间尝鲜 / 第一次了解这个测试",
    tasks: {
      srt:       { enabled: true, practice: 3, formal: 5 },
      schulte:   { enabled: true, size: 4, boards: 1 },
      stroop:    { enabled: true, practice: 8, formal: 16 },
      cancel:    { enabled: true, seconds: 30, targets: 10 },
      gonogo:    { enabled: true, practice: 8, formal: 30, goRatio: 0.8 },
      nback:     { enabled: true, practice: 6, formal: 20, matchRate: 0.3 },
      digitspan: { enabled: true, maxTrials: 3, startLen: 3 },
      survey:    { enabled: true, items: ["sleep_hours", "caffeine", "fatigue"] },
    },
  },
  standard: {
    id: "standard",
    name: "标准版",
    minutes: 12,
    timeLabel: "约 12 分钟",
    reliability: "中等",
    reliabilityShort: "试次适中，指标较稳定",
    tag: "推荐",
    summary: "时长与稳定性平衡，适合大多数人做一次认真自测。",
    covers: "六个维度全覆盖",
    scenes: "想了解自己注意力与记忆的整体状况",
    tasks: {
      srt:       { enabled: true, practice: 3, formal: 8 },
      schulte:   { enabled: true, size: 5, boards: 1 },
      stroop:    { enabled: true, practice: 8, formal: 28 },
      cancel:    { enabled: true, seconds: 45, targets: 14 },
      gonogo:    { enabled: true, practice: 10, formal: 50, goRatio: 0.8 },
      nback:     { enabled: true, practice: 8, formal: 36, matchRate: 0.3 },
      digitspan: { enabled: true, maxTrials: 5, startLen: 3 },
      survey:    { enabled: true, items: ["sleep_hours", "caffeine", "fatigue", "screen_time", "mood"] },
    },
  },
  full: {
    id: "full",
    name: "完整版",
    minutes: 20,
    timeLabel: "约 20 分钟",
    reliability: "较高",
    reliabilityShort: "试次充足，指标最稳定",
    tag: "认真自测",
    summary: "试次更多，个体内比较更可靠，适合想认真记录一次基线的人。",
    covers: "六个维度全覆盖，效应量更稳定",
    scenes: "认真自测 / 隔一段时间复测对比自己的变化",
    tasks: {
      srt:       { enabled: true, practice: 5, formal: 12 },
      schulte:   { enabled: true, size: 5, boards: 2 },
      stroop:    { enabled: true, practice: 8, formal: 48 },
      cancel:    { enabled: true, seconds: 60, targets: 20 },
      gonogo:    { enabled: true, practice: 12, formal: 80, goRatio: 0.8 },
      nback:     { enabled: true, practice: 10, formal: 56, matchRate: 0.3 },
      digitspan: { enabled: true, maxTrials: 8, startLen: 3 },
      survey:    { enabled: true, items: ["sleep_hours", "caffeine", "fatigue", "screen_time", "mood", "note"] },
    },
  },
};

const VERSION_ORDER = ["quick", "standard", "full"];
const DEFAULT_VERSION = "standard";   // 默认选中标准版（快速版只做显眼入口，不默认）

/* 诚实说明：三个版本共用一套组件，但试次不同，分数不可横向比较 */
const VERSION_NOTE = "试次越多，指标越稳定，但不是线性提升；不同版本的分数不能直接横向比较。";

/* 各任务显示名（结果页、分享卡片共用） */
const TASK_TITLES = {
  srt: "简单反应时",
  schulte: "舒尔特方格",
  stroop: "Stroop 色词干扰",
  cancel: "数字划消",
  gonogo: "Go / No-Go",
  nback: "2-back 工作记忆",
  digitspan: "数字广度",
};

function getVersion(id) {
  return VERSIONS[id] || VERSIONS[DEFAULT_VERSION];
}
function getVersionTaskCfg(versionId, taskId) {
  const v = getVersion(versionId);
  return (v.tasks && v.tasks[taskId]) || {};
}
/* 该版本实际执行的任务列表（按固定顺序） */
const TASK_ORDER = ["srt", "schulte", "stroop", "cancel", "gonogo", "nback", "digitspan"];
function versionTaskList(versionId) {
  const v = getVersion(versionId);
  return TASK_ORDER.filter((t) => v.tasks[t] && v.tasks[t].enabled !== false);
}


/* ===== js/share.js ===== */
/* ==================== 分享：结果卡片 / 分享文案 / 挑战链接 ====================
 * 只用匿名信息：版本、维度分、趣味称号、声明、站点链接。
 * 严禁写入 age / gender / device / sleep / caffeine / trial 原始数据。 */

/* 站点信息与署名单一来源：js/site-config.js（改署名只改那里） */
const SC = window.SITE_CONFIG || {};
const SITE_NAME = SC.siteName || "注意力与记忆力测试";
const DISCLAIMER = SC.disclaimer || "非诊断，仅供自测 / 娱乐 / 研究";
const SHARE_SIGNATURE = SC.shareSignature || "Bilibili：Panda-official";

const FUN_TITLES = {
  "反应速度": ["手比脑快选手", "闪电手指"],
  "选择性注意": ["火眼金睛", "细节捕手"],
  "抑制控制": ["稳如老狗选手", "刹车大师"],
  "持续注意": ["超长待机选手", "耐力型选手"],
  "工作记忆": ["人形缓存条", "记忆宫殿管理员"],
  "稳定性": ["稳态王者", "一根稳定的弦"],
};

function topDims(dims, n) {
  return Object.entries(dims || {})
    .filter(([, d]) => d && d.score !== null && d.score !== undefined)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, n || 3);
}

/* 一句话趣味称号：取最高维度 */
function funTitle(dims) {
  const top = topDims(dims, 1)[0];
  if (!top) return "刚出炉的新手玩家";
  const pool = FUN_TITLES[top[0]] || ["脑力选手"];
  return pool[Math.floor(Math.random() * pool.length)];
}

function siteUrl() {
  return location.origin + location.pathname.replace(/index\.html$/, "");
}

function versionLabel(vid) {
  const v = typeof getVersion === "function" ? getVersion(vid) : null;
  return v ? v.name : "测试版";
}

/* 展示用时长：会话隔天未关时 elapsed 会虚高（如 1262 分钟），
 * 超过 90 分钟即视为不可信，回退到版本标称时长。仅影响展示，导出数据仍用真实 duration_min。 */
function displayMins(state) {
  const mins = state.duration_min ? Math.max(1, Math.round(state.duration_min)) : null;
  if (mins === null || mins > 90) return getVersion(state.version).minutes;
  return mins;
}

/* ---------- 分享文案（可编辑） ---------- */
function buildShareText(state, dims) {
  const v = versionLabel(state.version);
  const mins = displayMins(state);
  const title = funTitle(dims);
  return [
    `我用 ${mins} 分钟做完了注意力与记忆力测试（${v}），结果挺有意思：号称「${title}」。`,
    `你也来试试？ ${siteUrl()}`,
  ].join("\n");
}

/* ---------- 挑战链接：只带版本 + 三个维度分，无排名无常模 ---------- */
function encodeChallenge(state, dims) {
  const payload = {
    v: state.version || DEFAULT_VERSION,
    d: topDims(dims, 3).map(([k, d]) => [k, d.score]),
    t: Date.now().toString(36),
  };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return siteUrl() + "#/c/" + b64.replace(/=+$/, "");
}
function decodeChallenge(code) {
  try {
    let s = String(code || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || !Array.isArray(obj.d)) return null;
    return obj;
  } catch (e) { return null; }
}

/* ---------- 结果卡片：1080×1320 PNG ---------- */
function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderShareCard(state, dims) {
  const W = 1080, H = 1320;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");

  /* 背景渐变 */
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1026");
  bg.addColorStop(0.55, "#1a1140");
  bg.addColorStop(1, "#0a1b3a");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  /* 光斑 */
  const glow = g.createRadialGradient(W * 0.5, 300, 40, W * 0.5, 300, 620);
  glow.addColorStop(0, "rgba(120,90,255,.55)");
  glow.addColorStop(1, "rgba(120,90,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  const center = (txt, y, font, color) => {
    g.fillStyle = color; g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(txt, W / 2, y);
  };

  /* 站点短名 + 版本（不再拼长站名，避免显示不全） */
  center(SITE_NAME, 92, "600 34px 'Microsoft YaHei', sans-serif", "rgba(200,214,255,.85)");
  g.fillStyle = "rgba(255,255,255,.10)";
  drawRoundRect(g, W / 2 - 96, 126, 192, 56, 28); g.fill();
  center(versionLabel(state.version) + " · " + displayMins(state) + " 分钟",
    154, "700 28px 'Microsoft YaHei', sans-serif", "#9be7ff");

  /* 趣味称号 */
  center("我的脑力称号", 268, "600 30px 'Microsoft YaHei', sans-serif", "rgba(190,200,235,.75)");
  const title = funTitle(dims);
  g.save();
  g.shadowColor = "rgba(120,90,255,.9)"; g.shadowBlur = 40;
  center("「" + title + "」", 348, "800 84px 'Microsoft YaHei', sans-serif", "#ffffff");
  g.restore();

  /* 三个维度条 */
  const rows = topDims(dims, 3);
  const x0 = 130, barW = 820, top0 = 470, gap = 148;
  rows.forEach(([name, d], i) => {
    const y = top0 + i * gap;
    g.textAlign = "left"; g.textBaseline = "middle";
    g.fillStyle = "rgba(226,232,255,.95)";
    g.font = "700 38px 'Microsoft YaHei', sans-serif";
    g.fillText(name, x0, y);
    g.textAlign = "right";
    g.fillStyle = "#9be7ff";
    g.fillText(String(d.score), x0 + barW, y);

    /* 轨道 */
    g.fillStyle = "rgba(255,255,255,.14)";
    drawRoundRect(g, x0, y + 34, barW, 20, 10); g.fill();
    /* 进度 */
    const grad = g.createLinearGradient(x0, 0, x0 + barW, 0);
    grad.addColorStop(0, "#7c5cff"); grad.addColorStop(1, "#3ee0ff");
    g.fillStyle = grad;
    drawRoundRect(g, x0, y + 34, Math.max(24, barW * Math.min(100, d.score) / 100), 20, 10); g.fill();
  });

  /* 声明 */
  center(DISCLAIMER, 1010, "600 32px 'Microsoft YaHei', sans-serif", "rgba(190,200,235,.8)");
  center("不同版本的分数不能直接横向比较", 1062, "500 28px 'Microsoft YaHei', sans-serif", "rgba(150,164,200,.75)");

  /* 底部条：CTA + B站署名（署名来自配置，不再展示会被截断的站点链接） */
  g.fillStyle = "rgba(255,255,255,.08)";
  drawRoundRect(g, 90, 1108, W - 180, 152, 26); g.fill();
  const ctaPart = "来测测你的脑力 → ";
  g.font = "700 34px 'Microsoft YaHei', sans-serif";
  const ctaW = g.measureText(ctaPart).width;
  const sigW = g.measureText(SHARE_SIGNATURE).width;
  let fx = W / 2 - (ctaW + sigW) / 2;
  g.textAlign = "left"; g.textBaseline = "middle";
  g.fillStyle = "#cfe0ff"; g.fillText(ctaPart, fx, 1184); fx += ctaW;
  g.fillStyle = "#ffcf7a"; g.fillText(SHARE_SIGNATURE, fx, 1184);

  return cv;
}

/* 打开卡片：页内弹层展示。
 * 不用 window.open/document.write——B站App等内嵌 WebView 会拦截，导致新窗口纯白屏；
 * 页内弹层在任何 WebView 都可用，手机长按图片保存，桌面点下载。 */
let __shareCardOverlay = null;
function openShareCard(state, dims) {
  const cv = renderShareCard(state, dims);
  const url = cv.toDataURL("image/png");

  /* 重复点击时先移除旧弹层，避免叠加 */
  if (__shareCardOverlay) { __shareCardOverlay.remove(); __shareCardOverlay = null; }

  const ov = document.createElement("div");
  ov.id = "share-card-overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-label", "分享卡片");
  ov.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:rgba(5,8,20,.94);" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "gap:14px;padding:20px;box-sizing:border-box;";

  const img = document.createElement("img");
  img.src = url;
  img.alt = "分享卡片";
  img.style.cssText =
    "width:100%;max-width:540px;max-height:70vh;object-fit:contain;" +
    "border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5);" +
    "-webkit-touch-callout:default;user-select:auto;";

  const dl = document.createElement("a");
  dl.href = url;
  dl.download = "brain-test-card.png";
  dl.textContent = "⬇ 下载图片";
  dl.style.cssText = "color:#9be7ff;font-size:14px;";

  const hint = document.createElement("p");
  hint.textContent = "手机长按图片保存 · 点空白处关闭";
  hint.style.cssText = "color:#8ea0c8;font-size:13px;margin:0;";

  const close = () => { ov.remove(); __shareCardOverlay = null; document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  /* 点空白处关闭；点图片本身不关，避免误触打断长按保存 */
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });

  ov.append(img, dl, hint);
  document.body.appendChild(ov);
  __shareCardOverlay = ov;
}


/* ===== js/ui.js ===== */
/* 轻量弹层：确认框 / 输入框 / 浮动提示
 * 为什么不用原生 confirm/alert/prompt：内置预览面板、iframe 沙箱、部分手机浏览器
 * 会静默屏蔽这些 API（confirm 直接返回 false），表现为"点击没反应"。
 * 这里全部用项目内的 DOM 弹层实现，任何环境都能正常交互。 */

let layerEl = null;
let active = null;   // { resolve, prevFocus, onKey }

function ensureLayer() {
  if (layerEl && document.body.contains(layerEl)) return layerEl;
  layerEl = document.createElement("div");
  layerEl.className = "ui-layer";
  layerEl.hidden = true;
  layerEl.innerHTML = `
    <div class="ui-mask"></div>
    <div class="ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-title">
      <h3 class="ui-title" id="ui-title"></h3>
      <p class="ui-msg"></p>
      <textarea class="ui-input" rows="4" spellcheck="false" hidden></textarea>
      <div class="ui-actions">
        <button type="button" class="btn ui-cancel">取消</button>
        <button type="button" class="btn ui-ok">确定</button>
      </div>
    </div>`;
  document.body.appendChild(layerEl);
  return layerEl;
}

function close(result) {
  if (!active) return;
  const { resolve, prevFocus, onKey } = active;
  active = null;
  document.removeEventListener("keydown", onKey, true);
  if (layerEl) layerEl.hidden = true;
  if (prevFocus && typeof prevFocus.focus === "function") {
    try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  resolve(result);
}

/* opts: { title, message, okText, cancelText(null=单按钮), danger, input:{value,placeholder,rows}, resolve } */
function render(opts, resolve) {
  if (active) close(null);   // 前一个弹层还在时先收掉，避免叠加

  const box = ensureLayer();
  const q = (s) => box.querySelector(s);
  const titleEl = q(".ui-title");
  const msgEl = q(".ui-msg");
  const inputEl = q(".ui-input");
  const okBtn = q(".ui-ok");
  const cancelBtn = q(".ui-cancel");

  titleEl.textContent = opts.title || "提示";
  titleEl.hidden = !opts.title;
  msgEl.textContent = opts.message || "";
  msgEl.hidden = !opts.message;

  const useInput = !!opts.input;
  inputEl.hidden = !useInput;
  if (useInput) {
    inputEl.value = opts.input.value || "";
    inputEl.placeholder = opts.input.placeholder || "";
    inputEl.rows = opts.input.rows || 4;
  }

  okBtn.textContent = opts.okText || "确定";
  okBtn.className = "btn ui-ok " + (opts.danger ? "danger" : "primary");
  const single = opts.cancelText === null;
  cancelBtn.hidden = single;
  cancelBtn.textContent = opts.cancelText || "取消";

  box.hidden = false;
  const prevFocus = document.activeElement;
  const cancelValue = useInput ? null : (single ? true : false);

  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close(cancelValue);
    } else if (e.key === "Enter" && (!useInput || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      close(useInput ? inputEl.value : true);
    }
  };
  document.addEventListener("keydown", onKey, true);
  active = { resolve, prevFocus, onKey };

  q(".ui-mask").onclick = () => close(cancelValue);
  cancelBtn.onclick = () => close(cancelValue);
  okBtn.onclick = () => close(useInput ? inputEl.value : true);

  setTimeout(() => {
    try {
      if (useInput) inputEl.focus();
      else if (!single) cancelBtn.focus({ preventScroll: true });
      else okBtn.focus({ preventScroll: true });
    } catch (e) { /* ignore */ }
  }, 30);
}

/* 确认框：返回 Promise<boolean>；cancelText 传 null 则只有"知道了"一个按钮 */
function uiConfirm(opts) {
  const o = typeof opts === "string" ? { message: opts } : (opts || {});
  return new Promise((resolve) => render({
    title: o.title || "",
    message: o.message || "",
    okText: o.okText,
    cancelText: o.cancelText === undefined ? "取消" : o.cancelText,
    danger: o.danger,
  }, resolve));
}

/* 输入框：返回 Promise<string|null>，取消返回 null */
function uiPrompt(opts) {
  const o = typeof opts === "string" ? { message: opts } : (opts || {});
  return new Promise((resolve) => render({
    title: o.title || "编辑内容",
    message: o.message || "",
    okText: o.okText || "复制",
    cancelText: "取消",
    input: { value: o.value || "", placeholder: o.placeholder || "", rows: o.rows || 5 },
  }, resolve));
}

/* 浮动提示：不打断操作，2 秒自动消失 */
let toastEl = null;
let toastTimer = null;
function uiToast(msg, type = "ok") {
  if (!toastEl || !document.body.contains(toastEl)) {
    toastEl = document.createElement("div");
    toastEl.className = "ui-toast";
    document.body.appendChild(toastEl);
  }
  toastEl.className = "ui-toast " + (type === "err" ? "is-err" : "is-ok");
  toastEl.textContent = msg;
  toastEl.hidden = false;
  requestAnimationFrame(() => { if (toastEl) toastEl.classList.add("is-show"); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (!toastEl) return;
    toastEl.classList.remove("is-show");
    setTimeout(() => { if (toastEl) toastEl.hidden = true; }, 220);
  }, 2200);
}


/* ===== js/scoring.js ===== */
/* ==================== 规则层评分：原始指标 → 六维度客观分（0-100） ====================
 * 只依据程序计算的结构化指标映射，AI 不得修改本层结果。
 * 缺失某任务时跳过该子项，维度分由其余子项均值构成；全部缺失则该维度为 null。 */

/* 各子项：[指标值, 最差→最好区间] → 0-100 */
function sub(x, lo, hi) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return Math.round(t * 100);
}
const avg = (arr) => {
  const v = arr.filter((x) => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
const M = (metrics, id) => (metrics[id] && !metrics[id].skipped) ? metrics[id] : {};

function computeDims(state) {
  const m = state.metrics || {};

  const srt = M(m, "srt");           // median_rt, cv
  const sch = M(m, "schulte");       // median_time_s, errors, grid
  const str = M(m, "stroop");        // accuracy, congruent_median, incongruent_median, stroop_effect
  const can = M(m, "cancel");        // hits, missed, false_hits, speed
  const gng = M(m, "gonogo");        // go_median_rt, omission_rate, commission_rate, cv_go, dprime
  const nb  = M(m, "nback");         // hit_rate, fa_rate, dprime, accuracy
  const ds  = M(m, "digitspan");     // max_span

  /* 舒尔特：4×4 与 5×5 不同盘面，统一折算为 5×5 等效用时再比较 */
  const schCells = sch.grid === "4x4" ? 16 : 25;
  const schTime5 = (sch.median_time_s === null || sch.median_time_s === undefined)
    ? null : +(sch.median_time_s * (25 / schCells)).toFixed(1);

  /* 各子项分 */
  const sSpeed   = sub(srt.median_rt, 450, 220);
  const gSpeed   = sub(gng.go_median_rt, 650, 300);
  const schScore = sub(schTime5, 75, 25);                    // 5×5 等效完成时间（秒）
  const stroopAcc= sub(str.accuracy, 0.6, 0.98);
  const stroopEff= sub(str.stroop_effect, 250, 20);          // 干扰量越小越好
  const schErr   = sub(sch.errors, 10, 0);
  const canSpeed = sub(can.speed, 4, 14);                    // 每分钟命中数
  const canMiss  = sub(can.missed, 12, 0);
  const commiss  = sub(gng.commission_rate, 0.4, 0);
  const omiss    = sub(gng.omission_rate, 0.3, 0);
  const nbHit    = sub(nb.hit_rate, 0.4, 1);
  const nbDp     = sub(nb.dprime, 0, 3.5);
  const span     = sub(ds.max_span, 3, 9);
  const cvStab   = sub(srt.cv, 0.35, 0.08);
  const cvGo     = sub(gng.cv_go, 0.45, 0.1);
  const canFalse = sub(can.false_hits, 12, 0);

  /* 六维度：子项均值（缺失自动跳过） */
  const dims = {
    "反应速度":   avg([sSpeed, gSpeed]),
    "选择性注意": avg([schScore, stroopEff, schErr]),
    "抑制控制":   avg([commiss, stroopEff, canFalse]),
    "持续注意":   avg([omiss, canMiss, nbHit]),
    "工作记忆":   avg([nbDp, span]),
    "稳定性":     avg([cvStab, cvGo]),
  };

  const level = (v) => v === null ? "—" : v >= 80 ? "优秀" : v >= 60 ? "良好" : v >= 40 ? "一般" : "待提升";
  const out = {};
  for (const [k, v] of Object.entries(dims)) {
    out[k] = { score: v, level: level(v) };
  }
  /* 版本可靠性：分数旁边要如实标注 */
  const ver = (typeof getVersion === "function") ? getVersion(state.version) : null;
  const reliability = {
    version: ver ? ver.id : null,
    versionName: ver ? ver.name : "未标注",
    label: ver ? ver.reliability : "未知",
    note: ver ? ver.reliabilityShort : "",
  };
  return { dims: out, reliability, schTime5 };
}

/* 供 AI 输入的结构化指标包（AI 只允许读取这些） */
function buildAiPayload(state, dims) {
  return {
    participant: {
      age: state.info.age ?? null,
      device_type: state.info.device_type ?? null,
      input_method: state.info.input_method ?? null,
      sleep_hours: state.info.sleep_hours ?? null,
      caffeine: state.info.caffeine ?? null,
      fatigue: state.info.fatigue ?? null,
    },
    task_metrics: state.metrics,
    dimension_scores: dims,
  };
}


/* ===== js/ai.js ===== */
/* ==================== AI 层：生成综合解释 ====================
 * 优先级：① 后端代理（Key 在服务器环境变量）→ ② 纯前端直连（用户自带 Key，仅 sessionStorage）。
 * 可配置：供应商 baseUrl、模型名、temperature、超时、重试次数。
 * 输入只含结构化指标与客观分；输出必须是 JSON，AI 不得修改客观分、不得做医学诊断。 */

function cfg() { return window.__getAiCfg(); }

function buildPrompt(payload) {
  const dimsText = Object.entries(payload.dimension_scores)
    .map(([k, v]) => `${k}：${v.score === null ? "缺失" : v.score + " 分（" + v.level + "）"}`)
    .join("；");
  return `你是一名认知测评助手。以下是用户在一次注意力与记忆力标准化自测中的结构化指标和程序计算的客观维度分。请只基于这些数据生成解读。

【重要约束】
1. 不得修改任何客观分数；
2. 不得做医学诊断，不得建议用药；
3. 若数据量小或存在缺失，须在置信度说明中明确指出；
4. 只输出一个 JSON 对象，不要输出其他文字，格式：
{"overall":"总评（2~3 句）","dimensions":{"维度名":"该维度表现解释（1~2 句）"},"suggestions":["建议1","建议2","建议3"],"confidence_note":"置信度说明"}

【六维度客观分】
${dimsText}

【各任务指标】
${JSON.stringify(payload.task_metrics)}

【背景信息】
${JSON.stringify(payload.participant)}`;
}

function extractJson(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("AI 返回中未找到 JSON");
  return JSON.parse(text.slice(s, e + 1));
}

async function fetchWithTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function generateReport(payload) {
  const c = cfg();
  const body = {
    model: c.model,
    temperature: c.temperature,
    messages: [
      { role: "system", content: "你是严谨、克制的认知测评解读助手，只输出 JSON。" },
      { role: "user", content: buildPrompt(payload) },
    ],
  };

  /* ① 后端代理：Key 在服务器环境变量，前端只发指标包 */
  if (c.proxy) {
    try {
      const res = await fetchWithTimeout(c.proxy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: payload }),
      }, c.timeoutMs);
      if (!res.ok) throw new Error("代理返回 " + res.status);
      const data = await res.json();
      return extractJson(data.report || data.content || data.text || (typeof data === "string" ? data : JSON.stringify(data)));
    } catch (e) {
      if (!c.apiKey) throw e;   // 无 Key 则直接走降级
      /* 代理失败但有 Key → 继续尝试直连 */
    }
  }

  /* ② 纯前端直连（OpenAI 兼容 chat/completions） */
  if (!c.apiKey) throw new Error("NO_KEY");

  let lastErr;
  for (let attempt = 0; attempt <= c.retries; attempt++) {
    try {
      const res = await fetchWithTimeout(c.baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.apiKey },
        body: JSON.stringify(body),
      }, c.timeoutMs);
      if (!res.ok) throw new Error("接口返回 " + res.status + (attempt < c.retries ? "，重试中" : ""));
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      return extractJson(text);
    } catch (e) {
      lastErr = e;
      if (attempt < c.retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr || new Error("AI 调用失败");
}


/* ===== tasks/consent.js ===== */
window.__tasks["consent"] = (() => {
/* ① 知情同意与基本信息填写 */
async function run(box, ctx) {
  /* 任务数与时长跟随版本配置（versions.js 为唯一真源，不在文案里写死数字） */
  const ver = getVersion(ctx.version);
  const taskCount = versionTaskList(ctx.version).length;
  box.innerHTML = `
    <div class="consent-text">
      <b>知情同意书</b>
      <p>1. 本测试为<b>自测/娱乐/研究用途，不构成医学诊断</b>。结果不代表任何临床结论。</p>
      <p>2. 测试包含 ${taskCount} 项认知任务，约 ${ver.minutes} 分钟。所有任务数据（反应时、正确率等）仅用于生成本次报告。</p>
      <p>3. 所有数据<b>仅保存在你的浏览器本地</b>，默认不上传；你可随时在结果页导出 JSON/CSV 或清除数据。</p>
      <p>4. 默认<b>不采集</b>注意力相关诊断等敏感信息；你也可以随时放弃测试，不会有任何后果。</p>
    </div>
    <label class="check-row"><input type="checkbox" id="ck-agree">
      <span>我已阅读并理解上述说明，自愿参加本次测试。</span></label>

    <div class="task-title">基本信息</div>
    <div class="field-row" style="grid-template-columns:repeat(3,1fr)">
      <label class="field"><span>年龄 <b class="req">*</b></span><input id="f-age" type="number" min="6" max="99" required></label>
      <label class="field"><span>设备类型 <b class="req">*</b></span>
        <select id="f-device"><option value="">请选择</option><option>手机</option><option>平板</option><option>电脑</option></select></label>
      <label class="field"><span>主要输入方式 <b class="req">*</b></span>
        <select id="f-input"><option value="">请选择</option><option>触屏</option><option>鼠标</option><option>键盘</option></select></label>
    </div>
    <details><summary class="hint" style="cursor:pointer">选填信息（用于结果解读参考，不影响客观分）</summary>
      <div class="field-row" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
        <label class="field"><span>性别</span><select id="f-sex"><option>不愿透露</option><option>男</option><option>女</option><option>其他</option></select></label>
        <label class="field"><span>教育年限</span><input id="f-edu" type="number" min="0" max="30" placeholder="如 12"></label>
        <label class="field"><span>母语</span><input id="f-lang" type="text" placeholder="如 中文"></label>
        <label class="field"><span>是否戴眼镜/矫正</span><select id="f-glasses"><option>否</option><option>是</option></select></label>
        <label class="field"><span>利手</span><select id="f-hand"><option>右利手</option><option>左利手</option><option>双手</option></select></label>
      </div>
    </details>
    <p class="hint" id="consent-err" style="color:var(--danger)" hidden>请完成必填项并勾选同意。</p>
    <div class="center-actions"><button class="btn primary" id="go">开始测试</button></div>
  `;

  return new Promise((resolve) => {
    const errEl = box.querySelector("#consent-err");
    const fail = (msg) => { errEl.textContent = msg; errEl.hidden = false; };
    box.querySelector("#go").addEventListener("click", () => {
      const ageRaw = box.querySelector("#f-age").value.trim();
      const device_type = box.querySelector("#f-device").value;
      const input_method = box.querySelector("#f-input").value;
      const agree = box.querySelector("#ck-agree").checked;
      /* 年龄按 min=6 / max=99 做数值校验：空、非整数、越界分别给出明确提示 */
      if (!agree) return fail("请先勾选「我已阅读并理解上述说明」。");
      if (!device_type || !input_method) return fail("请选择设备类型与主要输入方式。");
      if (!/^\d+$/.test(ageRaw)) return fail("年龄请填写 6~99 之间的整数。");
      const ageNum = Number(ageRaw);
      if (ageNum < 6 || ageNum > 99) return fail(`年龄 ${ageNum} 超出有效范围（6~99 岁），请修改后再开始。`);
      errEl.hidden = true;
      resolve({ info: {
        consent: true,
        age: ageNum,
        device_type, input_method,
        sex: box.querySelector("#f-sex").value,
        education_years: box.querySelector("#f-edu").value ? +box.querySelector("#f-edu").value : null,
        native_language: box.querySelector("#f-lang").value.trim() || null,
        glasses: box.querySelector("#f-glasses").value === "是",
        handedness: box.querySelector("#f-hand").value,
        test_time: new Date().toISOString(),
      }});
    });
  });
}

return { run };
})();

/* ===== tasks/device.js ===== */
window.__tasks["device"] = (() => {
/* ② 设备与输入方式检查：自动检测 + 交互确认 */

async function run(box, ctx) {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const w = window.innerWidth, h = window.innerHeight;
  const detectedDevice = Math.min(w, h) < 500 ? "手机" : Math.min(w, h) < 900 ? "平板" : "电脑";
  const detectedInput = coarse && !fine ? "触屏" : fine && !coarse ? "鼠标" : "混合（触屏+鼠标/触控板）";
  let keyboardOk = !coarse;   // 触屏设备可能没有实体键盘，检测到按键则确认

  /* 选中优先级：同意页的显式选择 → 自动检测（仅当取值在该下拉的合法项内）→ 首项。
   * 检测值可能落在选项之外（如"混合（触屏+鼠标/触控板）"），此时不得用它覆盖用户选择。 */
  const DEVICES = ["手机", "平板", "电脑"];
  const INPUTS = ["触屏", "鼠标", "键盘"];
  const userDevice = (ctx.info && ctx.info.device_type) || "";
  const userInput = (ctx.info && ctx.info.input_method) || "";
  const selDevice = DEVICES.includes(userDevice) ? userDevice
    : (DEVICES.includes(detectedDevice) ? detectedDevice : DEVICES[0]);
  const selInput = INPUTS.includes(userInput) ? userInput
    : (INPUTS.includes(detectedInput) ? detectedInput : INPUTS[0]);

  box.innerHTML = `
    <p class="task-instruction">已自动检测到以下环境信息，请确认或修正。随后请完成一次点击测试。</p>
    <div class="stage" id="dev-stage" style="min-height:180px">
      <table class="metrics" style="max-width:420px">
        <tr><th>项目</th><th>检测结果</th></tr>
        <tr><td>设备类型</td><td>${detectedDevice}（视口 ${w}×${h}）</td></tr>
        <tr><td>指针类型</td><td>${coarse ? "粗指针（触屏）" : "精指针（鼠标/触控板）"}</td></tr>
        <tr><td>键盘</td><td id="kb-cell">${keyboardOk ? "✅ 可用（或无需）" : "未检测到按键"}</td></tr>
        <tr><td>屏幕刷新计时</td><td>performance.now() ✅</td></tr>
      </table>
      <button class="btn primary" id="tap-test">👆 点我完成输入测试</button>
    </div>
    <div class="field-row" style="grid-template-columns:1fr 1fr;margin-top:14px">
      <label class="field"><span>设备类型确认</span>
        <select id="dev-device">${DEVICES.map(d => `<option ${d === selDevice ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      <label class="field"><span>主要输入方式确认</span>
        <select id="dev-input">${INPUTS.map(d => `<option ${d === selInput ? "selected" : ""}>${d}</option>`).join("")}</select></label>
    </div>
    <p class="hint" style="text-align:center;margin-top:6px">自动检测仅作建议，以你在这里（或同意页）的选择为准。</p>
    <div class="center-actions"><button class="btn primary" id="go">确认，进入下一项</button></div>
  `;

  const keyHandler = () => {
    keyboardOk = true;
    const c = box.querySelector("#kb-cell");
    if (c) c.textContent = "✅ 检测到键盘输入";
  };
  document.addEventListener("keydown", keyHandler);

  return new Promise((resolve) => {
    box.querySelector("#tap-test").addEventListener("click", () => {
      const b = box.querySelector("#tap-test");
      b.textContent = "✅ 输入正常";
      b.disabled = true;
    });
    box.querySelector("#go").addEventListener("click", () => {
      document.removeEventListener("keydown", keyHandler);
      resolve({ info: {
        device_type: box.querySelector("#dev-device").value,
        input_method: box.querySelector("#dev-input").value,
        viewport: w + "x" + h,
        keyboard_available: keyboardOk,
      }});
    });
  });
}

return { run };
})();

/* ===== tasks/srt.js ===== */
window.__tasks["srt"] = (() => {
/* ③ 简单反应时（热身）：圆点变绿瞬间尽快点击/按空格。练习/正式试次由版本配置决定。 */

async function run(box, ctx) {
  const P = ctx.cfg || {};
  const N_PRACTICE = P.practice ?? 5;
  const N_FORMAL = P.formal ?? 20;
  box.innerHTML = `
    <p class="task-instruction">圆点为灰色时耐心等待；它变绿的<b>瞬间</b>尽快点击屏幕或按空格键。
    练习 ${N_PRACTICE} 个（不计分），正式 ${N_FORMAL} 个。抢跑的试次会要求重来。</p>
    <div class="stage" id="srt-stage">
      <div class="gonogo-dot" id="srt-dot" style="background:#94a3b8"></div>
      <div class="final" id="srt-msg">点击下方按钮开始</div>
      <div class="hud"><span class="dim">进度 <b id="srt-n">0</b> / <b id="srt-total">0</b></span></div>
    </div>
    <div class="center-actions"><button class="btn primary" id="srt-go">开始</button></div>
  `;
  const stage = box.querySelector("#srt-stage");
  const dot = box.querySelector("#srt-dot");
  const msg = box.querySelector("#srt-msg");
  const nEl = box.querySelector("#srt-n");
  const totalEl = box.querySelector("#srt-total");

  let green = false, t0 = 0, timeoutId = null, armTimer = null;
  let anticipation = 0;   // 抢跑次数（只统计正式段，单独记录，不计入 RT 统计）
  let onRespond = null;   // 当前试次的响应回调

  function pressHandler() { if (onRespond) { const f = onRespond; onRespond = null; f(); } }
  stage.addEventListener("pointerdown", pressHandler);
  const keyHandler = (e) => { if (e.code === "Space") { e.preventDefault(); pressHandler(); } };
  document.addEventListener("keydown", keyHandler);
  /* 离开任务时回收监听与定时器，避免空格键在其他页面继续触发 */
  onCleanup(() => {
    document.removeEventListener("keydown", keyHandler);
    clearTimeout(timeoutId);
    clearTimeout(armTimer);
    onRespond = null;
  });

  /* 单个试次：抢跑自动重试，成功返回 rt（ms） */
  function trial(logged) {
    return new Promise((resolve) => {
      const arm = () => {
        green = false;
        dot.style.background = "#94a3b8";
        msg.textContent = logged ? "已开始 · 等待变绿…" : "已开始 · 练习 · 等待变绿…";
        timeoutId = setTimeout(() => {
          green = true;
          t0 = performance.now();
          dot.style.background = "#16a34a";
          msg.textContent = "现在！";
        }, 1200 + Math.random() * 2300);
        onRespond = () => {
          if (!green) {
            clearTimeout(timeoutId);
            msg.textContent = "太早了！等变绿再点";
            /* 抢跑写一条独立 trial（不含 RT，不进正式 RT 统计），便于统计冲动性 */
            if (logged) {
              anticipation++;
              ctx.logTrial("srt", { condition: "anticipation", stimulus: "green_dot", response: "early_press", correct: false, rt_ms: null });
            }
            armTimer = setTimeout(arm, 1000);
            return;
          }
          resolve(Math.round(performance.now() - t0));
        };
      };
      arm();
    });
  }

  const startBtn = box.querySelector("#srt-go");
  await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
  startBtn.style.display = "none";      // 开始后隐藏，避免重复点击
  msg.textContent = "已开始";

  // 练习（不记录），进度 1/N → N/N
  totalEl.textContent = String(N_PRACTICE);
  nEl.textContent = "0";
  for (let i = 0; i < N_PRACTICE; i++) {
    const rt = await trial(false);
    nEl.textContent = String(i + 1);
    msg.textContent = "练习：" + rt + " ms";
    await new Promise((r) => setTimeout(r, 700));
  }
  msg.textContent = "练习结束！点击下方按钮进入正式测试";
  const goBtn = box.querySelector("#srt-go");
  goBtn.textContent = `开始正式测试（${N_FORMAL} 个，计分）`;
  goBtn.style.display = "";
  await new Promise((res) => goBtn.addEventListener("click", res, { once: true }));
  goBtn.style.display = "none";         // 点击后立即隐藏，防止重复计时/重复结算
  msg.textContent = "已开始";

  // 正式（记录），进度独立重置
  totalEl.textContent = String(N_FORMAL);
  nEl.textContent = "0";
  const rts = [];
  for (let i = 0; i < N_FORMAL; i++) {
    const rt = await trial(true);
    rts.push(rt);
    ctx.logTrial("srt", { condition: "simple_rt", stimulus: "green_dot", response: "press", correct: true, rt_ms: rt });
    nEl.textContent = String(i + 1);
    msg.textContent = rt + " ms";
    await new Promise((r) => setTimeout(r, 800));
  }

  msg.textContent = "✅ 已完成";
  document.removeEventListener("keydown", keyHandler);
  return {
    task_id: "srt",
    n: rts.length,
    median_rt: median(rts),
    sd_rt: sd(rts),
    cv: cv(rts),
    anticipation_count: anticipation,   // 抢跑次数：单独汇总，不参与 RT 统计
  };
}

return { run };
})();

/* ===== tasks/schulte.js ===== */
window.__tasks["schulte"] = (() => {
/* ④ 舒尔特方格：练习 1 盘不计分 + 正式 N 盘；盘面大小与盘数由版本配置决定（4×4 / 5×5）。 */

async function run(box, ctx) {
  box.classList.add("grid-panel");   // 手机端收窄左右内边距，让方格尽量大且不超出卡片
  const P = ctx.cfg || {};
  const SIZE = P.size ?? 5;
  const N_BOARDS = P.boards ?? 1;
  const TOTAL_N = SIZE * SIZE;
  box.innerHTML = `
    <p class="task-instruction">按 <b>1 → ${TOTAL_N}</b> 的顺序依次点击数字，越快越准越好。
    练习 1 盘（不计分），正式 ${N_BOARDS} 盘。</p>
    <div class="hud" style="margin-bottom:10px">
      <span>当前目标：<b id="sc-next">1</b></span>
      <span class="dim">错误：<b id="sc-err">0</b></span>
      <span class="dim">用时：<b id="sc-time">0.0</b>s</span>
    </div>
    <div class="sgrid" id="sc-grid" style="grid-template-columns:repeat(${SIZE},1fr)"></div>
    <div class="center-actions"><button class="btn primary" id="sc-go">开始练习盘</button></div>
    <div class="final" id="sc-countdown" style="font-size:48px;text-align:center" hidden></div>
    <p class="task-status" id="sc-status">未开始</p>
  `;
  const grid = box.querySelector("#sc-grid");
  const nextEl = box.querySelector("#sc-next");
  const errEl = box.querySelector("#sc-err");
  const timeEl = box.querySelector("#sc-time");
  const goBtn = box.querySelector("#sc-go");
  const cdEl = box.querySelector("#sc-countdown");
  const statusEl = box.querySelector("#sc-status");

  const boardTimes = [], boardErrors = [];
  const totalBoards = N_BOARDS + 1;   // 1 练习 + N 正式
  let timerIv = null;
  let left = false;                   // 已离开任务：倒计时结束后不得再启动计时
  const timers = new Set();           // 倒计时与错误闪烁的 setTimeout，统一登记以便清理
  const abortHandlers = new Set();    // 让挂起的 await 在离开时立即收尾
  const onAbort = (fn) => { abortHandlers.add(fn); };
  function setT(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  onCleanup(() => {
    left = true;
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    clearInterval(timerIv);
    abortHandlers.forEach((fn) => { try { fn(); } catch (e) { /* 清理失败不影响流程 */ } });
    abortHandlers.clear();
  });

  function playBoard(isPractice) {
    return new Promise(async (resolve) => {
      onAbort(() => resolve(null));   // 离开任务时立即结束等待，不再继续倒计时/计时
      let next = 1, errors = 0, lastT = 0, startT = 0;
      nextEl.textContent = "1";
      errEl.textContent = "0";
      timeEl.textContent = "0.0";
      goBtn.style.display = "none";
      cdEl.hidden = false;
      grid.innerHTML = "";
      /* 准备阶段：方格全部遮盖（不显示数字），避免提前记忆路径 */
      const nums = shuffle([...Array(TOTAL_N).keys()].map((x) => x + 1));
      const cellBtns = nums.map(() => el(`<button class="gcell covered" style="background:#e5e7eb"></button>`));
      cellBtns.forEach((b) => grid.appendChild(b));
      /* 3 秒倒计时（定时器登记，离开页面时立即中断） */
      for (let c = 3; c >= 1; c--) {
        if (left) return;
        cdEl.textContent = String(c);
        await new Promise((r) => setT(r, 1000));
      }
      if (left) return;   // 倒计时期间已离开：不再启动计时与点击逻辑
      cdEl.hidden = true;
      /* 揭示数字并立即开始计时 */
      statusEl.textContent = "已开始";
      startT = performance.now();
      timerIv = setInterval(() => {
        timeEl.textContent = ((performance.now() - startT) / 1000).toFixed(1);
      }, 100);
      cellBtns.forEach((b, k) => {
        const num = nums[k];
        b.textContent = String(num);
        b.classList.remove("covered");
        b.style.background = "";
        b.addEventListener("click", () => {
          const now = performance.now();
          const rt = next === 1 ? null : Math.round(now - lastT);
          lastT = now;
          if (!isPractice) {
            ctx.logTrial("schulte", { condition: `${SIZE}x${SIZE}`, stimulus: String(next), response: String(num), correct: num === next, rt_ms: rt });
          }
          if (num === next) {
            b.classList.add("done");
            next++;                                  // 先自增，再渲染「当前目标」，避免 HUD 滞后一位
            if (next > TOTAL_N) {
              clearInterval(timerIv);
              const secs = +((now - startT) / 1000).toFixed(1);
              timeEl.textContent = secs.toFixed(1);   // 停在总用时
              if (!isPractice) { boardTimes.push(secs); boardErrors.push(errors); }
              statusEl.textContent = `✅ 已完成（用时 ${secs.toFixed(1)}s）`;
              statusEl.classList.add("done");
              resolve({ secs, errors });
            } else {
              nextEl.textContent = String(next);
            }
          } else {
            errors++;
            errEl.textContent = String(errors);
            b.style.background = "#fee2e2";
            setT(() => { b.style.background = ""; }, 200);
          }
        });
      });
    });
  }

  for (let i = 0; i < totalBoards; i++) {
    const isPractice = i === 0;
    goBtn.style.display = "";
    goBtn.textContent = isPractice ? "开始练习盘（不计分）" : `开始正式盘 ${i} / ${N_BOARDS}`;
    await new Promise((res) => { goBtn.addEventListener("click", res, { once: true }); onAbort(res); });
    if (left) return null;   // 等待「开始」时离开：直接结束
    statusEl.textContent = "已开始";      // 点击开始后按钮隐藏，状态切到"已开始"
    statusEl.classList.remove("done");
    await playBoard(isPractice);
    if (left) return null;   // 已离开任务：不再等待下一盘，避免继续登记监听
  }
  goBtn.style.display = "none";

  return {
    task_id: "schulte",
    grid: `${SIZE}x${SIZE}`,
    boards: boardTimes.length,
    median_time_s: median(boardTimes),
    total_errors: boardErrors.reduce((a, b) => a + b, 0),
  };
}

return { run };
})();

/* ===== tasks/stroop.js ===== */
window.__tasks["stroop"] = (() => {
/* ⑤ Stroop 色词干扰：判断文字的显示颜色。练习/正式试次由版本配置决定（正式试次一致/不一致各半，随机）。 */

const COLORS = [
  { name: "红", hex: "#dc2626" },
  { name: "绿", hex: "#16a34a" },
  { name: "蓝", hex: "#2563eb" },
  { name: "黄", hex: "#d97706" },
];

async function run(box, ctx) {
  const P = ctx.cfg || {};
  const N_PRACTICE = P.practice ?? 8;
  const N_FORMAL = P.formal ?? 60;
  box.innerHTML = `
    <p class="task-instruction">忽略文字含义，<b>只选文字的显示颜色</b>。点击按钮或按键盘 1-4。
    练习 ${N_PRACTICE} 个（不计分），正式 ${N_FORMAL} 个。</p>
    <div class="hud" style="margin-bottom:10px">
      <span class="dim">进度 <b id="st-n">0</b> / <b id="st-total">0</b></span>
      <span class="dim">正确 <b id="st-ok">0</b></span>
    </div>
    <div class="stage" style="min-height:170px"><div class="big-stim" id="st-word" style="font-size:56px">？</div></div>
    <div class="ans-btns" style="margin-top:12px" id="st-ans"></div>
    <div class="center-actions"><button class="btn primary" id="st-start">▶ 开始</button></div>
    <p class="task-status" id="st-status">未开始</p>
  `;
  const wordEl = box.querySelector("#st-word");
  const ansEl = box.querySelector("#st-ans");
  const nEl = box.querySelector("#st-n");
  const okEl = box.querySelector("#st-ok");
  const totalEl = box.querySelector("#st-total");
  const startBtn = box.querySelector("#st-start");
  const statusEl = box.querySelector("#st-status");

  COLORS.forEach((c, i) => {
    const b = el(`<button class="ans-btn">${c.name}<br><span style="font-size:11px;color:var(--text-dim)">键 ${i + 1}</span></button>`);
    b.addEventListener("click", () => respond(i));
    ansEl.appendChild(b);
  });

  let resolveTrial = null, acceptInput = false;
  function respond(i) {
    if (!acceptInput) return;
    acceptInput = false;
    resolveTrial(i);
  }
  const keyHandler = (e) => {
    const k = +e.key;
    if (k >= 1 && k <= 4) respond(k - 1);
  };
  document.addEventListener("keydown", keyHandler);
  onCleanup(() => document.removeEventListener("keydown", keyHandler));

  function showTrial(wordIdx, inkIdx, isPractice, trialIdx) {
    return new Promise((resolve) => {
      wordEl.textContent = COLORS[wordIdx].name;
      wordEl.style.color = COLORS[inkIdx].hex;
      const t0 = performance.now();
      acceptInput = true;
      resolveTrial = (choice) => {
        const rt = Math.round(performance.now() - t0);
        const correct = choice === inkIdx;
        if (!isPractice) {
          ctx.logTrial("stroop", {
            condition: wordIdx === inkIdx ? "congruent" : "incongruent",
            stimulus: `${COLORS[wordIdx].name}/${COLORS[inkIdx].name}`,
            response: COLORS[choice].name,
            correct, rt_ms: rt,
          });
        }
        resolve({ correct, rt, condition: wordIdx === inkIdx ? "congruent" : "incongruent" });
      };
    });
  }

  /* 正式试次：一致/不一致各半，随机 */
  const HALF = Math.floor(N_FORMAL / 2);
  const formal = shuffle([
    ...Array(HALF).fill("congruent"),
    ...Array(N_FORMAL - HALF).fill("incongruent"),
  ]);

  /* 干扰量只用正确试次计算：错误试次往往伴随迟疑，混入中位数会同时抬高两侧、甚至
   * 相互抵消出 0 或负值。某条件正确试次不足时输出 null，由结果页提示「数据不足」。
   * 样本阈值按版本：快速版试次少（每条件约 8 条），阈值放宽到 3；其余版本 5。 */
  const MIN_CORRECT_BY_VERSION = { quick: 3, standard: 5, full: 5 };
  const MIN_CORRECT = MIN_CORRECT_BY_VERSION[ctx.version] ?? 5;

  async function block(count, isPractice, conditions) {
    const rts = { congruent: [], incongruent: [] };
    let ok = 0;
    totalEl.textContent = String(count);
    nEl.textContent = "0";   // 每个阶段开始时进度独立重置
    okEl.textContent = "0";
    for (let i = 0; i < count; i++) {
      const condition = conditions[i];
      const wordIdx = Math.floor(Math.random() * 4);
      const inkIdx = condition === "congruent"
        ? wordIdx
        : (wordIdx + 1 + Math.floor(Math.random() * 3)) % 4;
      const r = await showTrial(wordIdx, inkIdx, isPractice, i);
      /* 练习与正式都更新进度 */
      nEl.textContent = String(i + 1);
      if (!isPractice) {
        if (r.correct) { rts[r.condition].push(r.rt); ok++; }   // 错误试次只计入正确率
        okEl.textContent = String(ok);
      }
    }
    return { rts, ok };
  }

  // 准备页：先点"开始"，之后才进入试次（此前按钮禁用输入，避免误触出数据）
  await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
  startBtn.style.display = "none";     // 点击后隐藏，防止重复点击
  statusEl.textContent = "已开始";

  // 练习
  const practiceConds = Array.from({ length: N_PRACTICE }, () => Math.random() < 0.5 ? "congruent" : "incongruent");
  await block(N_PRACTICE, true, practiceConds);
  wordEl.textContent = "？"; wordEl.style.color = "var(--text)";
  totalEl.textContent = String(N_FORMAL);
  // 正式
  const res = await block(N_FORMAL, false, formal);
  statusEl.textContent = "✅ 已完成";
  statusEl.classList.add("done");
  document.removeEventListener("keydown", keyHandler);

  const { rts, ok } = res;
  const cm = rts.congruent.length >= MIN_CORRECT ? median(rts.congruent) : null;
  const im = rts.incongruent.length >= MIN_CORRECT ? median(rts.incongruent) : null;
  return {
    task_id: "stroop",
    n: N_FORMAL,
    accuracy: +(ok / N_FORMAL).toFixed(3),
    n_correct: { congruent: rts.congruent.length, incongruent: rts.incongruent.length },
    min_n: MIN_CORRECT,
    congruent_median: cm,
    incongruent_median: im,
    stroop_effect: cm !== null && im !== null ? im - cm : null,
  };
}

return { run };
})();

/* ===== tasks/cancel.js ===== */
window.__tasks["cancel"] = (() => {
/* ⑥ 数字划消（60 秒）：每盘固定 16 个目标数字。练习 15 秒不计分，正式 60 秒。 */

const TOTAL = 80;   /* 总格数固定；列数随视口计算，窄屏更少列、每格更大 */
/* 不在模块加载时固定列数：旋转屏幕或分屏后按需重算，保证窄屏单格尽量接近触控尺寸 */
function colsForWidth() {
  const w = (typeof document !== "undefined" && document.documentElement.clientWidth) || window.innerWidth || 390;
  return w < 360 ? 7 : w < 480 ? 8 : 10;
}
/* 目标数与时长由版本配置决定（ctx.cfg.targets / ctx.cfg.seconds） */

async function run(box, ctx) {
  box.classList.add("grid-panel");   // 手机端收窄左右内边距，让格子尽量大且不超出卡片
  const P = ctx.cfg || {};
  const TOTAL_TIME = P.seconds ?? 60;
  const TARGET_COUNT = P.targets ?? 16;
  const PRACTICE_TIME = 15;
  let cols = colsForWidth();
  box.innerHTML = `
    <p class="task-instruction">在 <b>${TOTAL_TIME}</b> 秒内尽快划掉目标数字（每盘恰好 ${TARGET_COUNT} 个）。
    先来一段 ${PRACTICE_TIME} 秒练习（不计分），再进入正式测试。</p>
    <div class="cx-target-bar" style="background:#fff7ed;border:2px solid #f57c00;border-radius:10px;padding:10px 16px;font-size:22px;font-weight:700;text-align:center;margin-bottom:12px">
      目标数字：<span style="color:#f57c00;font-size:30px" id="cx-target">待开始</span>
      <span style="font-size:13px;color:#9a3412;font-weight:400">（点完 ${TARGET_COUNT} 个目标立即完成）</span>
    </div>
    <div class="hud" style="margin-bottom:10px">
      <span>时间：<b id="cx-time">--</b>s</span>
      <span>剩余目标：<b id="cx-left">${TARGET_COUNT}</b></span>
      <span class="dim">误点：<b id="cx-wrong">0</b></span>
    </div>
    <div class="cx-grid" id="cx-grid" style="grid-template-columns:repeat(${cols},1fr)"></div>
    <div class="center-actions"><button class="btn primary" id="cx-go">开始练习（${PRACTICE_TIME} 秒）</button></div>
    <p class="final" id="cx-final">未开始</p>
  `;
  const grid = box.querySelector("#cx-grid");
  const targetEl = box.querySelector("#cx-target");
  const timeEl = box.querySelector("#cx-time");
  const leftEl = box.querySelector("#cx-left");
  const wrongEl = box.querySelector("#cx-wrong");
  const goBtn = box.querySelector("#cx-go");
  const finalEl = box.querySelector("#cx-final");

  grid.style.pointerEvents = "";
  let finished = false;   // 幂等保护：防止重复结算（每轮开始时重置）
  let roundIv = null;     // 当前轮次倒计时定时器，离开任务时统一清理
  /* 视口变化（旋转/分屏）时重排列数；只重排布局，不改动已划掉的格子与计时 */
  const onResize = () => {
    const next = colsForWidth();
    if (next === cols) return;
    cols = next;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  };
  window.addEventListener("resize", onResize);
  onCleanup(() => {
    clearInterval(roundIv);
    window.removeEventListener("resize", onResize);
  });

  function buildBoard() {
    const target = 1 + Math.floor(Math.random() * 9);
    targetEl.textContent = String(target);
    const digits = Array(TOTAL).fill(target);
    const idxs = shuffle([...Array(TOTAL).keys()]);
    for (let k = TARGET_COUNT; k < TOTAL; k++) {
      let d;
      do { d = 1 + Math.floor(Math.random() * 9); } while (d === target);
      digits[idxs[k]] = d;
    }
    grid.innerHTML = "";
    const struck = new Array(TOTAL).fill(false);
    let struckTargets = 0;   // 已正确划掉的目标数（只统计 16 个目标格）
    digits.forEach((d, i) => {
      const b = el(`<button class="ccell">${d}</button>`);
      b.addEventListener("click", () => {
        if (finished || struck[i]) return;
        const correct = d === target;
        if (correct) {
          struck[i] = true; b.classList.add("struck");
          struckTargets++;
          leftEl.textContent = String(TARGET_COUNT - struckTargets);
        } else {
          b.classList.add("miss"); setTimeout(() => b.classList.remove("miss"), 200);
          wrongEl.textContent = String(+wrongEl.textContent + 1);
        }
        /* 顺序要求：先写本次 trial，再判断是否提前结算。
         * 结算会禁用方格并使 currentLog 之后不再记录，顺序颠倒会丢掉最后一个目标。 */
        if (currentLog) currentLog({ stimulus: String(d), response: correct ? "strike" : "wrong_strike", condition: "target_task", correct, rt_ms: null });
        // 全部目标划完 → 立即结算（只数目标格，不数全部 80 格）
        if (correct && struckTargets >= TARGET_COUNT && onAllStruck) { const f = onAllStruck; onAllStruck = null; f(); }
      });
      grid.appendChild(b);
    });
    return { target, digits, struck };
  }

  let currentLog = null;
  let onAllStruck = null;

  function runRound(seconds, isPractice) {
    return new Promise((resolve) => {
      leftEl.textContent = String(TARGET_COUNT); wrongEl.textContent = "0";
      finished = false;                 // 每轮重置幂等标记
      grid.style.pointerEvents = "";    // 重新启用方格
      const board = buildBoard();
      const roundStart = performance.now();
      let remaining = seconds;
      timeEl.textContent = String(remaining);
      goBtn.style.display = "none";
      /* 练习段不写盘；正式段一律记录。是否已结算由 finished 与方格拦截负责，
       * 这里不再用可变的 loggable 标记二次过滤，否则结算前最后一次点击会被丢掉。 */
      const isFormalRound = !isPractice;
      currentLog = (t) => {
        if (!isFormalRound) return;
        ctx.logTrial("cancel", {
          condition: t.correct ? "target_hit" : "false_positive",
          stimulus: t.stimulus, response: t.response,
          correct: t.correct, rt_ms: t.rt_ms,
        });
      };
      roundIv = setInterval(() => {
        remaining--;
        timeEl.textContent = String(remaining);
        if (remaining <= 0) finish(false);
      }, 1000);

      /* 幂等结算：清除定时器 → 禁用方格 → 记录完成时间 → 1 秒后 resolve 进入下一步 */
      function finish(early) {
        if (finished) return;   // 幂等：重复调用直接跳过
        finished = true;
        clearInterval(roundIv);
        grid.style.pointerEvents = "none";   // 禁用方格点击
        const elapsed = early ? (performance.now() - roundStart) / 1000 : seconds;
        const hits = board.digits.filter((d, i) => d === board.target && board.struck[i]).length;
        timeEl.textContent = Math.round(elapsed) + "s（已停止）";
        if (early) { finalEl.textContent = "✅ 已完成！"; finalEl.classList.add("done"); }
        setTimeout(() => {
          resolve({ hits, missed: TARGET_COUNT - hits, false_hits: +wrongEl.textContent, early, elapsed });
        }, 1000);
      }
      // 全部 16 个目标划完 → 提前结算
      onAllStruck = () => finish(true);
    });
  }

  await new Promise((res) => goBtn.addEventListener("click", res, { once: true }));
  finalEl.textContent = "练习已开始";
  await runRound(PRACTICE_TIME, true);
  finalEl.textContent = "练习结束，点击下方按钮进入正式测试";
  goBtn.textContent = `开始正式测试（${TOTAL_TIME} 秒，计分）`;
  goBtn.style.display = "";
  await new Promise((res) => goBtn.addEventListener("click", res, { once: true }));
  finalEl.textContent = "正式测试已开始";
  const r = await runRound(TOTAL_TIME, false);
  finalEl.textContent = `✅ 已完成！命中 ${r.hits} / ${TARGET_COUNT} · 漏掉 ${r.missed} · 误点 ${r.false_hits}${r.early ? "（提前完成）" : ""}`;

  return {
    task_id: "cancel",
    duration_s: TOTAL_TIME,
    target_count: TARGET_COUNT,
    actual_seconds: +r.elapsed.toFixed(1),
    hits: r.hits,
    missed: r.missed,
    false_hits: r.false_hits,
    speed: +(r.hits / (r.elapsed / 60)).toFixed(2),   // 每分钟命中数（按实际用时）
  };
}

return { run };
})();

/* ===== tasks/gonogo.js ===== */
window.__tasks["gonogo"] = (() => {
/* ⑦ Go/No-Go：绿点（Go）尽快点击，红点（No-Go）克制不点。
   练习/正式试次与 Go 比例由版本配置决定；刺激呈现 600ms，ISI 900~1300ms。 */

async function run(box, ctx) {
  const P = ctx.cfg || {};
  const N_PRACTICE = P.practice ?? 12;
  const N_FORMAL = P.formal ?? 100;
  const GO_RATIO = P.goRatio ?? 0.8;
  const goPct = Math.round(GO_RATIO * 100);
  const goFormal = Math.round(N_FORMAL * GO_RATIO), nogoFormal = N_FORMAL - goFormal;
  const goPractice = Math.max(1, Math.round(N_PRACTICE * GO_RATIO)), nogoPractice = Math.max(1, N_PRACTICE - goPractice);
  box.innerHTML = `
    <p class="task-instruction">出现<b style="color:#16a34a">绿色圆点</b>（Go，${goPct}%）→ 尽快点击屏幕或按空格；
    出现<b style="color:#dc2626">红色圆点</b>（No-Go，${100 - goPct}%）→ <b>克制住不要点</b>。练习 ${N_PRACTICE} 个，正式 ${N_FORMAL} 个。</p>
    <div class="stage" id="gng-stage">
      <div class="gonogo-dot" id="gng-dot" style="background:transparent"></div>
      <div class="final" id="gng-msg">点击下方按钮开始</div>
      <div class="hud"><span class="dim">进度 <b id="gng-n">0</b> / <b id="gng-total">12</b></span></div>
    </div>
    <div class="center-actions"><button class="btn primary" id="gng-start">▶ 开始</button></div>
    <p class="task-status" id="gng-status">未开始</p>
  `;
  const stage = box.querySelector("#gng-stage");
  const dot = box.querySelector("#gng-dot");
  const msg = box.querySelector("#gng-msg");
  const nEl = box.querySelector("#gng-n");
  const totalEl = box.querySelector("#gng-total");
  const startBtn = box.querySelector("#gng-start");
  const statusEl = box.querySelector("#gng-status");

  let onRespond = null;
  function press() { if (onRespond) { const f = onRespond; onRespond = null; f(); } }
  stage.addEventListener("pointerdown", press);
  const keyHandler = (e) => { if (e.code === "Space") { e.preventDefault(); press(); } };
  document.addEventListener("keydown", keyHandler);
  onCleanup(() => document.removeEventListener("keydown", keyHandler));

  /* 用户离开后立即停下：令牌作废 + 清定时器 + 让挂起的 await 立刻收尾 */
  const aborted = () => !!(ctx.ctl && ctx.ctl.aborted);
  const timers = new Set();
  const abortHandlers = new Set();
  const setT = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const onAbort = (fn) => { abortHandlers.add(fn); };
  onCleanup(() => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    abortHandlers.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    abortHandlers.clear();
  });

  function trial(isGo, isPractice, idx) {
    return new Promise((resolve) => {
      onAbort(() => resolve({ responded: false, rt: null }));
      setT(() => {
        if (aborted()) { resolve({ responded: false, rt: null }); return; }
        dot.style.background = isGo ? "#16a34a" : "#dc2626";
        const t0 = performance.now();
        let responded = false, rtMs = null, settled = false;
        /* 关键：响应瞬间记录时间戳，窗口结束时不再用「当前时刻」反推 */
        onRespond = () => {
          if (settled || responded) return;
          responded = true;
          rtMs = Math.round(performance.now() - t0);
        };
        setT(() => {
          dot.style.background = "transparent";
          settled = true;
          onRespond = null;
          const rt = responded ? rtMs : null;   // 未响应 → null；已响应保留真实 RT
          if (!isPractice && !aborted()) {
            ctx.logTrial("gonogo", {
              condition: isGo ? "go" : "nogo",
              stimulus: isGo ? "green_dot" : "red_dot",
              response: responded ? "press" : "no_response",
              correct: isGo ? responded : !responded,
              rt_ms: isGo && responded ? rt : null,
            });
          }
          resolve({ responded, rt });
          nEl.textContent = String(idx + 1);
        }, 600);
      }, 900 + Math.random() * 400);
    });
  }

  async function runBlock(seq, isPractice) {
    const stats = { goRts: [], omiss: 0, commiss: 0, correctRej: 0, nGo: 0, nNoGo: 0 };
    for (let i = 0; i < seq.length; i++) {
      if (aborted()) break;                  // 已离开：不再生成试次
      const isGo = seq[i];
      const r = await trial(isGo, isPractice, i);
      if (isGo) {
        stats.nGo++;
        if (r.responded) stats.goRts.push(r.rt);
        else stats.omiss++;
      } else {
        stats.nNoGo++;
        if (r.responded) stats.commiss++;
        else stats.correctRej++;
      }
      if (isPractice) {
        msg.textContent = !isGo && r.responded ? "❌ 不该点！" : isGo && !r.responded ? "⭕ 漏掉了" : "✅";
      }
    }
    return stats;
  }

  totalEl.textContent = String(N_PRACTICE);
  /* 准备页：点按钮才开始，避免点到舞台就被记成第一次反应 */
  await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
  startBtn.style.display = "none";     // 点击后隐藏，防止重复点击
  statusEl.textContent = "已开始";
  msg.textContent = "练习已开始";
  await runBlock(shuffle([...Array(goPractice).fill(true), ...Array(nogoPractice).fill(false)]), true);
  if (aborted()) return null;             // 用户已离开：不进入正式段

  msg.textContent = "练习结束，正式测试即将开始…";
  totalEl.textContent = String(N_FORMAL);
  nEl.textContent = "0";
  await new Promise((r) => { setT(r, 1500); onAbort(r); });
  if (aborted()) return null;
  msg.textContent = "已开始";   // 不再残留"点击继续"等准备态文案
  const s = await runBlock(shuffle([...Array(goFormal).fill(true), ...Array(nogoFormal).fill(false)]), false);
  if (aborted()) return null;             // 已离开：不结算、不写盘
  msg.textContent = "✅ 已完成";
  statusEl.textContent = "✅ 已完成";
  statusEl.classList.add("done");
  document.removeEventListener("keydown", keyHandler);

  const hitRate = s.nGo ? s.goRts.length / s.nGo : null;
  return {
    task_id: "gonogo",
    n: s.nGo + s.nNoGo,
    n_go: s.nGo,
    n_nogo: s.nNoGo,
    go_median_rt: median(s.goRts),
    go_sd_rt: sd(s.goRts),
    cv_go: cv(s.goRts),
    omission_rate: s.nGo ? +(s.omiss / s.nGo).toFixed(3) : null,
    commission_rate: s.nNoGo ? +(s.commiss / s.nNoGo).toFixed(3) : null,
    hit_rate: hitRate === null ? null : +hitRate.toFixed(3),
    dprime: dprime(s.goRts.length, s.nGo, s.commiss, s.nNoGo),
  };
}

return { run };
})();

/* ===== tasks/nback.js ===== */
window.__tasks["nback"] = (() => {
/* ⑧ N-back（2-back）：方块位置序列，与前第 2 个位置相同按「匹配」。试次由版本配置决定。 */

const N = 2, STIM_MS = 2200, LIT_MS = 900, POS = 9;

async function run(box, ctx) {
  const P = ctx.cfg || {};
  const N_PRACTICE = P.practice ?? 12;
  const N_FORMAL = P.formal ?? 42;
  const MATCH_RATE = P.matchRate ?? 0.3;
  box.innerHTML = `
    <p class="task-instruction">方块每 ${STIM_MS / 1000} 秒亮一次。若当前<b>亮起的位置</b>与<b>前面第 ${N} 个</b>位置相同，
    在亮起后尽快点「匹配」（或按空格）；不同则什么都不按。练习 ${N_PRACTICE} 个，正式 ${N_FORMAL} 个。</p>
    <div class="nb-grid" id="nb-grid"></div>
    <div class="nb-actions">
      <button class="btn" id="nb-match" hidden>匹配（空格）</button>
      <span class="hud" style="align-self:center"><span class="dim">进度 <b id="nb-n">0</b> / <b id="nb-total">0</b></span></span>
    </div>
    <div class="center-actions" style="margin-top:10px"><button class="btn primary" id="nb-start">▶ 开始</button></div>
    <p class="task-status" id="nb-status">未开始</p>
  `;
  const grid = box.querySelector("#nb-grid");
  const matchBtn = box.querySelector("#nb-match");
  const startBtn = box.querySelector("#nb-start");
  const nEl = box.querySelector("#nb-n");
  const totalEl = box.querySelector("#nb-total");
  const statusEl = box.querySelector("#nb-status");
  for (let i = 0; i < POS; i++) grid.appendChild(el(`<div class="nb-cell" data-i="${i}"></div>`));
  const cells = [...grid.children];

  /* 生成固定匹配率的序列 */
  function genSeq(len, matchRate) {
    const seq = [];
    for (let i = 0; i < len; i++) {
      if (i >= N && Math.random() < matchRate) seq.push(seq[i - N]);
      else {
        let p;
        do { p = Math.floor(Math.random() * POS); }
        while (i >= N && p === seq[i - N]);
        seq.push(p);
      }
    }
    return seq;
  }

  let responded = false;

  let liveKeyHandler = null;
  onCleanup(() => { if (liveKeyHandler) document.removeEventListener("keydown", liveKeyHandler); });

  /* 用户离开后立即停下：令牌作废 + 清定时器 + 让挂起的 await 立刻收尾 */
  const aborted = () => !!(ctx.ctl && ctx.ctl.aborted);
  const timers = new Set();
  const abortHandlers = new Set();
  const setT = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const onAbort = (fn) => { abortHandlers.add(fn); };
  const wait = (ms) => new Promise((r) => { setT(r, ms); onAbort(r); });
  onCleanup(() => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    abortHandlers.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    abortHandlers.clear();
  });

  function playSeq(seq, isPractice) {
    return new Promise(async (resolve) => {
      nEl.textContent = "0";   // 每阶段进度独立重置
      const stats = { hits: 0, misses: 0, fas: 0, corrRej: 0, nTargets: 0, nNonTargets: 0, seq };
      for (let i = 0; i < seq.length; i++) {
        if (aborted()) break;                  // 已离开：不再生成试次
        const pos = seq[i];
        const isTarget = i >= N && pos === seq[i - N];
        responded = false;
        // 亮起
        cells[pos].classList.add("lit");
        const litAt = performance.now();
        const onMatch = () => {
          if (responded) return;
          responded = true;
          const rt = Math.round(performance.now() - litAt);
          if (isTarget) stats.hits++;
          else stats.fas++;
          if (!isPractice && !aborted()) {
            ctx.logTrial("nback", {
              condition: isTarget ? "target" : "non_target",
              stimulus: `pos_${pos}`,
              response: "match",
              correct: isTarget,
              rt_ms: rt,
            });
          }
        };
        const btnHandler = () => onMatch();
        const keyHandler = (e) => { if (e.code === "Space") { e.preventDefault(); onMatch(); } };
        matchBtn.addEventListener("click", btnHandler, { once: true });
        liveKeyHandler = keyHandler;
        document.addEventListener("keydown", keyHandler, { once: true });
        await wait(LIT_MS);
        cells[pos].classList.remove("lit");
        // 剩余响应窗口
        await wait(STIM_MS - LIT_MS);
        matchBtn.removeEventListener("click", btnHandler);
        document.removeEventListener("keydown", keyHandler);
        if (!responded) {
          if (isTarget) stats.misses++;
          else stats.corrRej++;
          if (!isPractice && !aborted()) {
            ctx.logTrial("nback", {
              condition: isTarget ? "target" : "non_target",
              stimulus: `pos_${pos}`,
              response: "no_response",
              correct: !isTarget,
              rt_ms: null,
            });
          }
        }
        /* 练习与正式都更新进度 */
        nEl.textContent = String(i + 1);
      }
      resolve(stats);
    });
  }

  totalEl.textContent = String(N_PRACTICE);
  /* 准备页：先点"开始"，之后才显示"匹配（空格）"进入试次 */
  await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
  startBtn.style.display = "none";     // 点击后隐藏，防止重复点击
  statusEl.textContent = "已开始";
  matchBtn.hidden = false;
  await playSeq(genSeq(N_PRACTICE, MATCH_RATE), true);
  if (aborted()) return null;          // 用户已离开：不进入正式段

  totalEl.textContent = String(N_FORMAL);
  nEl.textContent = "0";
  statusEl.textContent = "练习结束，准备进入正式测试";
  startBtn.textContent = "▶ 开始正式测试";
  startBtn.style.display = "";         // 正式测试另起一个明确的开始入口
  await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
  startBtn.style.display = "none";
  statusEl.textContent = "已开始（正式）";
  const s = await playSeq(genSeq(N_FORMAL, MATCH_RATE), false);
  if (aborted()) return null;          // 已离开：不结算、不写盘
  statusEl.textContent = "✅ 已完成";
  statusEl.classList.add("done");

  return {
    task_id: "nback",
    n: s.seq.length,
    n_targets: s.nTargets || s.hits + s.misses,
    hit_rate: (s.hits + s.misses) ? +(s.hits / (s.hits + s.misses)).toFixed(3) : null,
    fa_rate: (s.fas + s.corrRej) ? +(s.fas / (s.fas + s.corrRej)).toFixed(3) : null,
    accuracy: +((s.hits + s.corrRej) / s.seq.length).toFixed(3),
    dprime: dprime(s.hits, s.hits + s.misses, s.fas, s.fas + s.corrRej),
  };
}

return { run };
})();

/* ===== tasks/digitspan.js ===== */
window.__tasks["digitspan"] = (() => {
/* ⑨ 数字广度（顺向）：练习 1 次（不计分），正式按版本配置的序列数上限推进，每长度 2 次机会。 */

async function run(box, ctx) {
  const P = ctx.cfg || {};
  const MAX_TRIALS = P.maxTrials ?? 8;
  const START_LEN = P.startLen ?? 3;
  box.innerHTML = `
    <p class="task-instruction">屏幕会逐个显示一串数字（每位约 0.8 秒），显示完毕后<b>按同样顺序</b>输入。
    从 ${START_LEN + 1} 位开始，每个长度有 2 次机会，连续两次失败即结束；本版本最多 ${MAX_TRIALS} 个正式序列。
    练习 1 次（${START_LEN} 位，不计分）。</p>
    <div class="stage">
      <div class="digit-show" id="ds-show">&nbsp;</div>
      <div class="final" id="ds-msg">点击下方按钮开始</div>
      <div class="pad" id="ds-pad" style="visibility:hidden"></div>
    </div>
    <div class="center-actions"><button class="btn primary" id="ds-start">▶ 开始</button></div>
    <p class="task-status" id="ds-status">未开始</p>
  `;
  const showEl = box.querySelector("#ds-show");
  const msgEl = box.querySelector("#ds-msg");
  const pad = box.querySelector("#ds-pad");
  const startBtn = box.querySelector("#ds-start");
  const statusEl = box.querySelector("#ds-status");
  for (let i = 0; i < 10; i++) {
    const b = el(`<button>${i}</button>`);
    b.addEventListener("click", () => inputDigit(i));
    pad.appendChild(b);
  }
  pad.appendChild(el(`<button style="grid-column:span 1">⌫</button>`)).addEventListener("click", () => {
    inputStr = inputStr.slice(0, -1);
    showEl.textContent = inputStr || " ";
  });
  pad.appendChild(el(`<button style="grid-column:span 1">✓</button>`)).addEventListener("click", () => submit());

  let inputStr = "", inputResolve = null;

  function inputDigit(d) {
    if (inputStr.length >= 12 || !inputResolve) return;
    inputStr += d;
    showEl.textContent = inputStr;
  }
  function submit() {
    if (!inputResolve || !inputStr) return;
    const v = inputStr;
    inputStr = "";
    inputResolve(v);
  }

  async function showDigits(digits) {
    pad.style.visibility = "hidden";
    showEl.textContent = " ";
    for (const d of digits) {
      showEl.textContent = String(d);
      await wait(800);
      showEl.textContent = " ";
      await wait(200);
    }
    msgEl.textContent = "请按顺序输入";
    inputStr = "";
    pad.style.visibility = "visible";
    const ans = await new Promise((r) => { inputResolve = r; });
    inputResolve = null;
    pad.style.visibility = "hidden";
    return ans;
  }

  async function oneTrial(len, isPractice) {
    const digits = Array.from({ length: len }, () => Math.floor(Math.random() * 10));
    const t0 = performance.now();
    const ans = await showDigits(digits);
    const correct = ans === digits.join("");
    if (!isPractice) {
      ctx.logTrial("digitspan", {
        condition: "forward_span",
        stimulus: digits.join(""),
        response: ans,
        correct,
        rt_ms: Math.round(performance.now() - t0),
      });
    }
    msgEl.textContent = correct ? `✅ 正确！（${len} 位）` : `❌ 错误，正确答案是 ${digits.join("")}`;
    await wait(1200);
    return correct;
  }

  /* 统一入口：显示按钮 → 等待点击 → 隐藏（避免整块面板随便点就开跑） */
  async function gate(text, label) {
    msgEl.textContent = text;
    startBtn.textContent = label || "▶ 继续";
    startBtn.style.display = "";
    await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
    startBtn.style.display = "none";     // 点击后隐藏，防止重复点击
    statusEl.textContent = "已开始";
  }

  await gate("点击下方按钮开始练习", "▶ 开始");
  await oneTrial(START_LEN, true);

  let span = START_LEN, failsAtLen = 0, len = START_LEN + 1, trials = 0;
  while (len <= 12 && trials < MAX_TRIALS) {
    await gate(`${len} 位 · 第 1 次机会，点击继续`);
    const ok1 = await oneTrial(len, false); trials++;
    if (ok1) { span = len; len++; failsAtLen = 0; continue; }
    if (trials >= MAX_TRIALS) break;   // 先判上限：达到上限直接结束，不再弹一次空的「第 2 次机会」
    await gate(`${len} 位 · 第 2 次机会，点击继续`);
    const ok2 = await oneTrial(len, false); trials++;
    if (ok2) { span = len; len++; failsAtLen = 0; continue; }
    break;   // 双败结束
  }
  msgEl.textContent = `测试结束，你的数字广度：${span} 位`;
  statusEl.textContent = "✅ 已完成";
  statusEl.classList.add("done");

  return { task_id: "digitspan", max_span: span };
}

return { run };
})();

/* ===== tasks/survey.js ===== */
window.__tasks["survey"] = (() => {
/* ⑩ 状态问卷：题目数量由版本配置 ctx.cfg.items 控制（快速 3 项 / 标准 5 项 / 完整 6 项） */
async function run(box, ctx) {
  const items = (ctx.cfg && Array.isArray(ctx.cfg.items)) ? ctx.cfg.items
    : ["sleep_hours", "caffeine", "fatigue", "screen_time", "mood", "note"];

  const HTML = {
    sleep_hours: `<label class="field"><span>昨晚睡眠时长（小时）</span>
      <input id="q-sleep_hours" type="number" min="0" max="16" step="0.5" placeholder="如 7.5"></label>`,
    caffeine: `<label class="field"><span>过去 6 小时咖啡因摄入</span>
      <select id="q-caffeine"><option>无</option><option>少量（≤1 杯咖啡/茶）</option><option>中等（2~3 杯）</option><option>大量（≥4 杯或含能量饮料）</option></select></label>`,
    fatigue: `<label class="field"><span>当前疲劳程度（1 = 精力充沛，7 = 非常疲惫）：<b id="q-fatigue-v">3</b></span>
      <input id="q-fatigue" type="range" min="1" max="7" step="1" value="3"></label>`,
    screen_time: `<label class="field"><span>今天已连续看屏幕时长（小时）</span>
      <input id="q-screen_time" type="number" min="0" max="16" step="0.5" placeholder="如 4"></label>`,
    mood: `<label class="field"><span>当前情绪/紧张程度（1 = 很放松，7 = 很紧张）：<b id="q-mood-v">3</b></span>
      <input id="q-mood" type="range" min="1" max="7" step="1" value="3"></label>`,
    note: `<label class="field"><span>备注（可选）</span><input id="q-note" type="text" placeholder="如 刚运动完、环境有点吵"></label>`,
  };

  box.innerHTML = `
    <p class="task-instruction">最后 ${items.length} 个关于当前状态的问题（选填，仅用于结果解读参考）。</p>
    ${items.map((k) => HTML[k] || "").join("")}
    <div class="center-actions"><button class="btn primary" id="go">提交并查看结果</button></div>
  `;

  ["fatigue", "mood"].forEach((k) => {
    const s = box.querySelector("#q-" + k);
    if (s) s.addEventListener("input", () => { box.querySelector("#q-" + k + "-v").textContent = s.value; });
  });

  return new Promise((resolve) => {
    box.querySelector("#go").addEventListener("click", () => {
      const info = {};
      const num = (id) => {
        const e = box.querySelector("#" + id);
        return e && e.value ? +e.value : null;
      };
      const val = (id) => {
        const e = box.querySelector("#" + id);
        return e ? e.value : null;
      };
      if (items.includes("sleep_hours")) info.sleep_hours = num("q-sleep_hours");
      if (items.includes("caffeine")) info.caffeine = val("q-caffeine");
      if (items.includes("fatigue")) info.fatigue = num("q-fatigue");
      if (items.includes("screen_time")) info.screen_time = num("q-screen_time");
      if (items.includes("mood")) info.mood = num("q-mood");
      if (items.includes("note")) info.note = (val("q-note") || "").trim() || null;
      resolve({ info });
    });
  });
}

return { run };
})();

/* ===== tasks/results.js ===== */
window.__tasks["results"] = (() => {
/* ⑪ 结果汇总：版本标注 + 客观维度分 + 任务指标 + 分享卡片 + AI 解释 + 导出 */




async function run(box, ctx) {
  const state = window.__getSession();
  state.finished_at = state.finished_at || new Date().toISOString();
  const started = new Date(state.started_at || Date.now()).getTime();
  const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
  state.duration_min = mins;
  try { localStorage.setItem("atc-session", JSON.stringify(state)); } catch (e) { /* 隐私模式下忽略 */ }

  const { dims, reliability } = computeDims(state);
  const ver = getVersion(state.version);
  const isQuick = state.version === "quick";
  const plannedTasks = versionTaskList(state.version);   // 本版本应完成的任务（含被跳过项）
  const doneTasks = plannedTasks.filter((id) => state.metrics[id] && !state.metrics[id].skipped);
  const skippedTasks = plannedTasks.filter((id) => state.metrics[id] && state.metrics[id].skipped);
  const countNote = skippedTasks.length
    ? `完成 ${doneTasks.length} 项任务（${plannedTasks.length} 项中 ${skippedTasks.length} 项跳过）`
    : `完成 ${doneTasks.length} 项任务`;
  const relNote = isQuick ? "快速版：样本较少，仅供参考" : `${ver.name}：${ver.reliabilityShort}`;

  box.innerHTML = `
    <!-- 版本横幅 -->
    <div class="ver-banner">
      <span class="vb-name">${ver.name}</span>
      <span class="vb-meta">实际用时约 ${mins} 分钟 · ${countNote}</span>
      <span class="vb-rel">可靠性：${ver.reliability}</span>
    </div>
    <p class="hint" style="text-align:center">参与者 ${state.participant_id} · 会话 ${state.session_id} · 完成于 ${new Date().toLocaleString()}</p>
    <p class="hint" style="text-align:center">完成的任务：${doneTasks.map((t) => TASK_TITLES[t]).join(" · ") || "—"}${skippedTasks.length ? `（跳过：${skippedTasks.map((t) => TASK_TITLES[t]).join("、")}）` : ""}</p>

    <!-- 分享（显著但不遮挡结果） -->
    <div class="share-bar">
      <button class="btn primary" id="sh-card">📤 生成分享卡片</button>
      <button class="btn" id="sh-copy">📋 复制分享文案</button>
      <button class="btn" id="sh-challenge">🔥 挑战好友</button>
      <button class="btn" id="again-btn">🔄 再次测试</button>
    </div>
    <p class="hint" id="sh-tip" hidden style="color:#16a34a">✅ 已复制</p>

    <h3 style="margin:16px 0 4px">六维度客观分（0-100，规则层计算）</h3>
    <p class="hint">${relNote}。不同版本的分数<b>不能直接横向比较</b>（试次越多越稳定，但并非线性提升）。</p>
    <div class="dim-grid" id="dim-grid"></div>
    <div class="center-actions" style="margin-top:8px">
      ${state.version !== "standard" ? `<a class="btn" href="#/test/new?ver=standard">去做标准版（${getVersion("standard").timeLabel}）</a>` : ""}
      ${state.version !== "full" ? `<a class="btn" href="#/test/new?ver=full">去做完整版（${getVersion("full").timeLabel}）</a>` : ""}
    </div>

    <h3 style="margin:16px 0 4px">各任务指标</h3>
    <div class="table-wrap"><table class="metrics" id="metrics-table"></table></div>
    ${isQuick ? '<p class="hint">⚠️ 快速版试次较少，效应量（干扰量、d′）仅供参考；某条件正确试次不足时会标注「数据不足」。</p>' : ""}

    <h3 style="margin:16px 0 4px">AI 综合解释</h3>
    <div class="ai-box">
      <p class="hint" style="margin-bottom:8px">
        <b>推荐方式（无需任何配置）：</b>点击下方按钮复制测试报告和提示词，粘贴到任意 AI 网站（如 DeepSeek、Kimi）即可获得解读。
        <b>本网站不会自动上传你的数据</b>，是否粘贴给 AI 由你自行决定。
      </p>
      <div class="export-row" style="margin-bottom:10px">
        <button class="btn" id="copy-report">📋 复制测试报告</button>
        <button class="btn" id="copy-prompt">📋 复制 AI 提示词模板</button>
      </div>
      <div class="export-row" id="ai-links-row" style="margin-bottom:10px"></div>
      <p class="hint" id="copy-ok" hidden style="color:#16a34a">✅ 已复制到剪贴板</p>

      <details style="margin-top:12px">
        <summary style="cursor:pointer" class="hint">⚙️ 高级：自动调用 AI（API / 后端代理，可选）</summary>
        <div style="margin-top:8px">
          <div class="hint" style="margin-bottom:8px">AI 只读取结构化指标与客观分，生成解释与建议；<b>不会修改客观分，也不构成医学诊断</b>。
          未配置时请前往 <a href="#/settings">⚙️ 设置</a>。</div>
          <div class="ai-body" id="ai-body">尚未生成。</div>
          <div class="center-actions"><button class="btn primary" id="ai-go">调用 AI 生成解释</button></div>
        </div>
      </details>
    </div>

    <h3 style="margin:16px 0 4px">导出数据</h3>
    <div class="export-row">
      <button class="btn" id="exp-json">导出 JSON（含 trial 级原始数据）</button>
      <button class="btn" id="exp-csv">导出 CSV（trial 级原始数据）</button>
    </div>
    <p class="hint" style="margin-top:10px">⚕️ 本报告为自测/娱乐/研究用途，<b>不构成医学诊断</b>；如有困扰请咨询专业机构。</p>
  `;

  /* 维度分（带版本可靠性提示） */
  const dimGrid = box.querySelector("#dim-grid");
  for (const [name, d] of Object.entries(dims)) {
    dimGrid.appendChild(el(`<div class="dim-item">
      <div class="dhead"><span>${name}</span><span class="lvl-${d.level === "优秀" ? "高" : d.level === "待提升" ? "低" : "中"}">${d.score === null ? "—" : d.score + " · " + d.level}</span></div>
      <div class="dbar"><i style="width:${d.score ?? 0}%"></i></div>
      <div class="dnote">${d.score === null ? "该维度数据缺失" : relNote}</div>
    </div>`));
  }

  /* 指标表 */
  const TASK_NAMES = {
    srt: "简单反应时", schulte: "舒尔特方格", stroop: "Stroop", cancel: "数字划消",
    gonogo: "Go/No-Go", nback: "2-back", digitspan: "数字广度",
  };
  const FMT = {
    srt: (m) => `中位 ${m.median_rt}ms · SD ${m.sd_rt}ms · CV ${m.cv}`,
    schulte: (m) => `${m.grid || "5x5"} 中位 ${m.median_time_s}s · ${m.boards} 盘 · 总错误 ${m.total_errors}`,
    stroop: (m) => {
      /* 干扰量只用正确试次计算，样本不足时为 null → 明确提示，不显示 nullms / NaN */
      const accPct = Number.isFinite(m.accuracy) ? Math.round(m.accuracy * 100) : 0;
      const acc = `正确率 ${accPct}%`;
      const need = m.min_n || 5;
      const nc = m.n_correct || { congruent: 0, incongruent: 0 };
      const ms = (v) => (Number.isFinite(v) ? Math.round(v) : "—");
      if (!Number.isFinite(m.stroop_effect)) {
        return `${acc} · 干扰量：数据不足（正确试次 一致 ${nc.congruent} 条 / 不一致 ${nc.incongruent} 条，需各 ≥ ${need} 条）`;
      }
      const tail = isQuick ? "（快速版样本较少，仅供参考）" : "";
      return `${acc} · 一致 ${ms(m.congruent_median)}ms · 不一致 ${ms(m.incongruent_median)}ms · 干扰量 ${Math.round(m.stroop_effect)}ms${tail}`;
    },
    cancel: (m) => `命中 ${m.hits}/${m.target_count || 16} · 漏划 ${m.missed} · 误划 ${m.false_hits} · 速度 ${m.speed}/min`,
    gonogo: (m) => isQuick
      ? `Go 中位 ${m.go_median_rt}ms · 漏报率 ${(m.omission_rate * 100).toFixed(0)}% · 虚报率 ${(m.commission_rate * 100).toFixed(0)}%（试次少，不输出 d′）`
      : `Go 中位 ${m.go_median_rt}ms · 漏报率 ${(m.omission_rate * 100).toFixed(0)}% · 虚报率 ${(m.commission_rate * 100).toFixed(0)}% · d′ ${m.dprime}`,
    nback: (m) => isQuick
      ? `命中率 ${(m.hit_rate * 100).toFixed(0)}% · 虚报率 ${(m.fa_rate * 100).toFixed(0)}%（试次少，不输出 d′）`
      : `命中率 ${(m.hit_rate * 100).toFixed(0)}% · 虚报率 ${(m.fa_rate * 100).toFixed(0)}% · d′ ${m.dprime} · 总正确率 ${(m.accuracy * 100).toFixed(0)}%`,
    digitspan: (m) => `最大广度 ${m.max_span} 位`,
  };
  const table = box.querySelector("#metrics-table");
  for (const id of plannedTasks.concat(["digitspan"]).filter((v, i, a) => a.indexOf(v) === i)) {
    if (!TASK_NAMES[id]) continue;
    const m = state.metrics[id];
    const cell = m
      ? m.skipped ? '<span style="color:#b45309">⏭ 该任务已跳过，未计分</span>' : FMT[id](m)
      : '<span class="hint">未完成</span>';
    table.appendChild(el(`<tr><td>${TASK_NAMES[id]}</td><td>${cell}</td></tr>`));
  }

  /* 再次测试 */
  const againBtn = box.querySelector("#again-btn");
  againBtn.addEventListener("click", async () => {
    const ok = await uiConfirm({
      title: "再次测试",
      message: "将清空当前测试结果，回到版本选择页重新开始，确定吗？",
      okText: "确定重新开始",
      danger: true,
    });
    if (!ok) return;
    againBtn.disabled = true;
    window.__restartTest();
  });

  /* ---------- 分享 ---------- */
  const tip = box.querySelector("#sh-tip");
  let tipTimer = null;
  const showTip = (t) => {
    tip.textContent = t || "✅ 已复制";
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.hidden = true; }, 2200);
  };
  box.querySelector("#sh-card").addEventListener("click", () => {
    try { openShareCard(state, dims); } catch (e) { console.error(e); uiToast("卡片生成失败，但不影响查看结果", "err"); }
  });
  box.querySelector("#sh-copy").addEventListener("click", async () => {
    const txt = await uiPrompt({
      title: "分享文案",
      message: "文案可直接编辑，确认后复制：",
      value: buildShareText(state, dims),
      okText: "复制",
      rows: 6,
    });
    if (txt === null) return;
    const ok = await copyText(txt);
    if (ok) showTip(); else uiToast("复制失败，请手动选中复制", "err");
  });
  box.querySelector("#sh-challenge").addEventListener("click", async () => {
    const link = encodeChallenge(state, dims);
    const ok = await copyText(link);
    if (ok) showTip("✅ 挑战链接已复制，发给好友即可");
    else {
      const manual = await uiPrompt({ title: "挑战链接", message: "自动复制失败，请手动复制下面的链接：", value: link, okText: "复制", rows: 3 });
      if (manual !== null) copyText(manual);
    }
  });

  /* 好友挑战对比（只对比两次个人表现，无排名/常模） */
  try {
    const pend = JSON.parse((function () { try { return localStorage.getItem("atc-challenge"); } catch (e) { return null; } })() || "null");
    if (pend && pend.d && pend.v === state.version) {
      const mine = {};
      for (const [k, s] of topDims(dims, 3)) mine[k] = s;
      const rows = pend.d.map(([k, s]) => `<tr><td>${k}</td><td>${s}</td><td>${mine[k] ?? "—"}</td></tr>`).join("");
      box.insertBefore(el(`<div class="panel" style="margin-top:14px">
        <h3 style="margin:0 0 6px">🔥 与好友的对比（同版本）</h3>
        <div class="table-wrap"><table class="metrics"><tr><th>维度</th><th>好友</th><th>你</th></tr>${rows}</table></div>
        <p class="hint" style="margin-top:8px">这里只对比你们两次的个人成绩，<b>不代表人群排名或常模</b>。</p>
      </div>`), box.querySelector("#dim-grid").parentNode.nextSibling);
      try { localStorage.removeItem("atc-challenge"); } catch (e) {}
    }
  } catch (e) {}

  /* ---------- AI：复制报告 / 提示词 / 链接 ---------- */
  function buildReportText() {
    const lines = [];
    lines.push("【注意力与记忆力测试报告】");
    lines.push(`版本：${ver.name}（可靠性：${ver.reliability}）· 实际用时约 ${mins} 分钟`);
    lines.push(`参与者 ${state.participant_id} · 会话 ${state.session_id} · 完成于 ${new Date(state.finished_at || Date.now()).toLocaleString()}`);
    lines.push("");
    lines.push("一、六维度客观分（0-100，由网站规则计算）：");
    for (const [name, d] of Object.entries(dims)) {
      lines.push(`- ${name}：${d.score === null ? "数据缺失" : d.score + "（" + d.level + "）"}`);
    }
    lines.push("");
    lines.push("二、任务完成情况：");
    for (const id of plannedTasks) {
      const m = state.metrics[id];
      lines.push(`- ${TASK_TITLES[id]}：${!m ? "未完成" : m.skipped ? "已跳过（未计分）" : FMT[id](m)}`);
    }
    const p = state.info || {};
    lines.push("");
    lines.push(`三、背景信息：年龄 ${p.age ?? "未填"} · 睡眠 ${p.sleep_hours ?? "未填"} 小时 · 咖啡因 ${p.caffeine ?? "未填"} · 疲劳度 ${p.fatigue ?? "未填"}/7`);
    lines.push("");
    lines.push(`四、口径说明：${VERSION_NOTE}`);
    lines.push("⚕️ 声明：本测试为自测/娱乐/研究用途，不构成医学诊断。如有困扰请咨询专业医疗机构。");
    return lines.join("\n");
  }
  function buildPromptText() {
    return [
      "你是一名认知测评解读助手。请基于下面这份「注意力与记忆力测试报告」，用通俗语言完成：",
      "1. 总评：2-3 句概括整体表现；",
      "2. 维度解读：逐条解释每个维度分数的含义与可能影响因素；",
      "3. 建议：给出 3-5 条可操作的日常改善建议；",
      "4. 置信度说明：结合版本可靠性（本次为「" + ver.name + "」）指出结论的可信程度与局限。",
      "",
      "硬性要求：不得做出任何医学诊断或建议用药；不得修改或重算客观分数；不得跨版本横向比较分数；语气客观中立。",
      "",
      buildReportText(),
    ].join("\n");
  }
  const copyOk = box.querySelector("#copy-ok");
  let copyTimer = null;
  function showCopyOk() {
    copyOk.hidden = false;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyOk.hidden = true; }, 2000);
  }
  box.querySelector("#copy-report").addEventListener("click", async () => {
    if (await copyText(buildReportText())) showCopyOk();
    else uiToast("复制失败，请手动选中复制", "err");
  });
  box.querySelector("#copy-prompt").addEventListener("click", async () => {
    if (await copyText(buildPromptText())) showCopyOk();
    else uiToast("复制失败，请手动选中复制", "err");
  });

  /* 常用 AI 链接：顺序与 URL 集中在 js/ai-links-config.js */
  const linksRow = box.querySelector("#ai-links-row");
  for (const l of (window.AI_LINKS || [])) {
    if (l.url) linksRow.appendChild(el(`<a class="btn" href="${l.url}" target="_blank" rel="noopener">${l.name}</a>`));
    else linksRow.appendChild(el(`<span class="btn" style="opacity:.5;cursor:not-allowed" title="官方网址待确认">${l.name}（待确认）</span>`));
  }

  /* AI 自动调用（失败降级） */
  const aiBody = box.querySelector("#ai-body");
  const aiBtn = box.querySelector("#ai-go");
  aiBtn.addEventListener("click", async () => {
    aiBtn.disabled = true;
    aiBody.innerHTML = '<span class="hint">AI 生成中…（最长可能需要 1 分钟）</span>';
    try {
      const payload = buildAiPayload(state, dims);
      payload.reliability = reliability;
      const report = await generateReport(payload);
      let html = `<b>总评：</b>${escapeHtml(report.overall || "--")}\n\n`;
      html += "<b>维度解读：</b>\n" + Object.entries(report.dimensions || {}).map(([k, v]) => `· ${k}：${v}`).join("\n") + "\n\n";
      html += "<b>建议：</b>\n" + (report.suggestions || []).map((s) => `· ${s}`).join("\n");
      html += `\n\n<span class="hint">置信度说明：${escapeHtml(report.confidence_note || "--")}</span>`;
      aiBody.innerHTML = html.replace(/\n/g, "<br>");
      aiBtn.textContent = "重新生成";
    } catch (e) {
      const noKey = String(e.message || e).includes("NO_KEY");
      aiBody.innerHTML = `<span class="ai-err">⚠️ AI 解释暂不可用${noKey ? "（未配置 AI，请前往 ⚙️ 设置；或使用上面的复制方式）" : "（" + escapeHtml(String(e.message || e)) + "）"}。</span><br>
        <span class="hint">以下客观评分与导出数据不受影响。</span>`;
      aiBtn.textContent = "重试";
    }
    aiBtn.disabled = false;
  });

  box.querySelector("#exp-json").addEventListener("click", () => window.__exportSession("json"));
  box.querySelector("#exp-csv").addEventListener("click", () => window.__exportSession("csv"));

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) {}
      ta.remove();
      return ok;
    }
  }
}

return { run };
})();

/* ===== app.js ===== */
/* ==================== 应用：路由 / 测试流程状态机 / 存储 / 导出 ==================== */




/* ---------- 存储安全封装 ----------
 * 预览沙箱 / 隐私模式下 localStorage/sessionStorage 可能被禁用（访问即抛 SecurityError），
 * 这里统一降级为内存存储，保证功能在任何环境可运行（数据不持久仅影响续测）。 */
const memStore = {};
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return memStore[k] ?? null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { memStore[k] = v; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { delete memStore[k]; } };
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return memStore["ss:" + k] ?? null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch { memStore["ss:" + k] = v; } };
const ssDel = (k) => { try { sessionStorage.removeItem(k); } catch { delete memStore["ss:" + k]; } };

/* ---------- 常量与状态 ---------- */
const PARTICIPANT_KEY = "atc-participant-id";
const SESSION_KEY = "atc-session";

function getParticipantId() {
  let id = lsGet(PARTICIPANT_KEY);
  if (!id) {
    id = "P-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    lsSet(PARTICIPANT_KEY, id);
  }
  return id;
}

let state = null;

function newSession() {
  return {
    participant_id: getParticipantId(),
    session_id: "S-" + Date.now().toString(36),
    step: 0,
    version: null,        // quick | standard | full（开始前选择，开始后锁定）
    started_at: new Date().toISOString(),
    finished_at: null,
    duration_min: null,   // 实际总时长（分钟）
    info: {},      // 基本信息 + 设备 + 问卷
    trials: [],    // trial 级原始数据
    metrics: {},   // 各任务汇总指标
  };
}

function saveSession() {
  lsSet(SESSION_KEY, JSON.stringify(state));
}

function loadSession() {
  try {
    const s = JSON.parse(lsGet(SESSION_KEY));
    return s || null;   // 未完成与已完成的会话都保留（刷新后可恢复结果）
  } catch (e) { return null; }
}

/* ---------- 运行令牌（可取消） ----------
 * 每个步骤开始时创建新令牌；切步骤 / 离开测试页时把旧令牌标为 aborted。
 * 异步任务返回后据此判断「是否仍是当前步骤」，已作废则不再结算、推进或写盘。 */
let currentCtl = null;

function beginRun() {
  if (currentCtl) currentCtl.aborted = true;
  runCleanups();                       // 回收上一个任务的定时器与事件监听
  currentCtl = { aborted: false };
  return currentCtl;
}
function abortRun() {
  if (currentCtl) currentCtl.aborted = true;
  currentCtl = null;
  runCleanups();
}
const isAborted = (ctl) => !!(ctl && ctl.aborted);

/* 记录一条 trial 级原始数据（字段严格按规范）
 * 已作废的步骤不再写入：用户离开后后台残余的试次不会污染数据。 */
function logTrial(task_id, trial) {
  if (isAborted(currentCtl)) return;
  state.trials.push({
    participant_id: state.participant_id,
    session_id: state.session_id,
    task_id,
    trial_index: state.trials.filter((t) => t.task_id === task_id).length,
    condition: trial.condition ?? null,
    stimulus: trial.stimulus ?? null,
    response: trial.response ?? null,
    correct: trial.correct ?? null,
    rt_ms: trial.rt_ms ?? null,
    timestamp: Date.now(),
  });
}

/* ---------- 测试流程步骤（三版本共用，按配置过滤任务） ---------- */
const ALL_STEPS = [
  { id: "consent",   title: "知情同意与基本信息", mod: () => Promise.resolve({ run: window.__tasks["consent"].run }),  task: false },
  { id: "device",    title: "设备与输入方式检查", mod: () => Promise.resolve({ run: window.__tasks["device"].run }),   task: false },
  { id: "srt",       title: "简单反应时（热身）", mod: () => Promise.resolve({ run: window.__tasks["srt"].run }),      task: true  },
  { id: "schulte",   title: "舒尔特方格",         mod: () => Promise.resolve({ run: window.__tasks["schulte"].run }),  task: true  },
  { id: "stroop",    title: "Stroop 色词干扰",    mod: () => Promise.resolve({ run: window.__tasks["stroop"].run }),   task: true  },
  { id: "cancel",    title: "数字划消",           mod: () => Promise.resolve({ run: window.__tasks["cancel"].run }),   task: true  },
  { id: "gonogo",    title: "Go / No-Go",         mod: () => Promise.resolve({ run: window.__tasks["gonogo"].run }),   task: true  },
  { id: "nback",     title: "N-back（2-back）",   mod: () => Promise.resolve({ run: window.__tasks["nback"].run }),    task: true  },
  { id: "digitspan", title: "数字广度",           mod: () => Promise.resolve({ run: window.__tasks["digitspan"].run }),task: true  },
  { id: "survey",    title: "状态问卷",           mod: () => Promise.resolve({ run: window.__tasks["survey"].run }),   task: false },
  { id: "results",   title: "结果汇总与 AI 解释", mod: () => Promise.resolve({ run: window.__tasks["results"].run }),  task: false },
];
let STEPS = ALL_STEPS;   // 当前版本实际流程（版本确定后重建）
function stepsFor(versionId) {
  const allowed = new Set(versionTaskList(versionId));
  return ALL_STEPS.filter((s) => !TASK_ORDER.includes(s.id) || allowed.has(s.id));
}

const taskCtx = (stepId, ctl) => ({
  logTrial: logTrial,
  info: state.info,
  version: state.version,
  cfg: getVersionTaskCfg(state.version, stepId),
  ctl: ctl,                 // 取消令牌：任务内部轮询 ctl.aborted 以便尽快停下
});

/* ---------- 测试流程渲染 ---------- */
const testRoot = $("#test-root");

function renderProgress(i) {
  const pct = Math.round((i / (STEPS.length - 1)) * 100);
  return el(`<div class="progress"><div class="pbar"><i style="width:${pct}%"></i></div><span>${i + 1} / ${STEPS.length}</span></div>`);
}

async function runStep(i) {
  const ctl = beginRun();   // 作废上一个步骤的令牌 + 回收其定时器/监听
  state.step = i;
  saveSession();
  testRoot.innerHTML = "";
  const step = STEPS[i];
  testRoot.appendChild(renderProgress(i));
  testRoot.appendChild(el(`<div class="task-title">${step.title}</div>`));

  const box = el(`<div class="panel"></div>`);
  testRoot.appendChild(box);

  try {
    const mod = await step.mod();
    const metrics = await mod.run(box, taskCtx(step.id, ctl));
    /* 用户已离开该步骤（或已切到别的步骤）：不结算、不推进、不写盘 */
    if (isAborted(ctl) || state.step !== i) return;
    if (metrics) {
      Object.assign(state.info, metrics.info || {});
      if (metrics.task_id) state.metrics[metrics.task_id] = metrics;
      saveSession();
      nextStep(i);
    }
  } catch (err) {
    if (isAborted(ctl) || state.step !== i) return;   // 离开导致的异常不提示
    console.error(err);
    box.innerHTML = `<p style="color:var(--danger)">⚠️ 本步骤加载出错：${String(err && err.message || err)}<br>
      <span class="hint">请截图反馈；或刷新页面重试（进度已保存，可继续）。</span></p>`;
  }
}

function nextStep(i) {
  if (i + 1 >= STEPS.length) { return; }
  const next = STEPS[i + 1];
  abortRun();               // 任务结束即回收资源并作废旧令牌（休息页停留期间不再响应旧按键）
  state.step = i + 1;
  saveSession();
  testRoot.innerHTML = "";

  // 休息页：正式认知任务之后展示；问卷之后直接进结果
  const cur = STEPS[i];
  if (cur.task && next.id !== "results") {
    const rest = el(`<div class="panel rest-box">
      <h2>✅ 已完成：${cur.title}</h2>
      <p>休息一下，准备好后点击继续（下一个：${next.title}）</p>
      <button class="btn primary">继续</button>
    </div>`);
    rest.querySelector("button").addEventListener("click", () => runStep(i + 1));
    testRoot.appendChild(renderProgress(i + 1));
    testRoot.appendChild(rest);
  } else {
    runStep(i + 1);
  }
}

/* ---------- 版本选择页（开始前选择，开始后不可切换） ---------- */
function renderVersionPicker(preselect) {
  /* preselect：结果页「去做标准版/完整版」带入的目标版本；非法或缺省时用默认版本 */
  const preset = VERSION_ORDER.includes(preselect) ? preselect : DEFAULT_VERSION;
  testRoot.innerHTML = "";
  testRoot.appendChild(el(`<div class="task-title">选择测试版本</div>`));
  testRoot.appendChild(el(`<p class="hint" style="text-align:center;margin:6px 0 14px">
    三个版本共用同一套任务，只是试次多少不同。<b>${VERSION_NOTE}</b></p>`));

  const wrap = el(`<div class="ver-list"></div>`);
  VERSION_ORDER.forEach((id) => {
    const v = VERSIONS[id];
    const isDefault = id === DEFAULT_VERSION;
    const isPreset = id === preset;
    const card = el(`<label class="ver-card ${isDefault ? "is-default" : ""} ${id === "quick" ? "is-quick" : ""}">
      <input type="radio" name="ver" value="${id}" ${isPreset ? "checked" : ""}>
      <div class="ver-main">
        <div class="ver-head">
          <b class="ver-name">${v.name}</b>
          <span class="ver-time">${v.timeLabel}</span>
          ${isDefault ? '<span class="ver-badge">推荐</span>' : ""}
          ${id === "quick" ? '<span class="ver-badge quick">新手尝鲜</span>' : ""}
        </div>
        <p class="ver-desc">${v.summary}</p>
        <ul class="ver-meta">
          <li>测什么：${v.covers}</li>
          <li>适合：${v.scenes}</li>
          <li>可靠性：<b>${v.reliability}</b>（${v.reliabilityShort}）</li>
        </ul>
      </div>
    </label>`);
    wrap.appendChild(card);
  });
  testRoot.appendChild(wrap);
  testRoot.appendChild(el(`<p class="hint" style="margin-top:12px">
    ⚠️ 版本需在开始前确定，开始后不能切换；若中途退出再重新开始，可选择其他版本（已产生数据会重置）。</p>`));
  const go = el(`<div class="center-actions"><button class="btn primary" id="ver-go">开始测试</button></div>`);
  testRoot.appendChild(go);
  go.querySelector("#ver-go").addEventListener("click", () => {
    const picked = testRoot.querySelector('input[name="ver"]:checked');
    const vid = (picked && picked.value) || DEFAULT_VERSION;
    state = newSession();
    state.version = vid;
    STEPS = stepsFor(vid);
    saveSession();
    /* 进入正式流程：地址与顶栏标题同步为"标准化测试"。
     * replaceState 在预览沙箱 / 隐私模式可能抛 SecurityError，失败时仅更新标题，不影响流程。 */
    try { history.replaceState(null, "", "#/test"); } catch (e) { /* ignore */ }
    pageTitle.textContent = "📋 标准化测试";
    runStep(0);
  });
}

async function startTest() {
  abortRun();               // 进入测试页先作废上一轮（挑战页 → 测试页等）
  /* 已完成的会话（从设置页返回 / 刷新页面后）：直接重新渲染结果，不重置会话 */
  const doneSaved = (!state || state.finished_at) ? loadSession() : null;
  const restore = (s) => { state = s; STEPS = stepsFor(state.version || DEFAULT_VERSION); };
  if (!state && doneSaved && doneSaved.finished_at) {
    restore(doneSaved);
    runStep(STEPS.length - 1);
    return;
  }
  if (state && state.finished_at) { runStep(STEPS.length - 1); return; }

  const saved = loadSession();
  if (saved && saved.step > 0 && saved.version) {
    restore(saved);
    testRoot.innerHTML = "";
    const box = el(`<div class="panel rest-box">
      <h2>发现未完成的测试</h2>
      <p>版本：<b>${getVersion(saved.version).name}</b> · 上次进行到「${STEPS[Math.min(saved.step, STEPS.length - 1)].title}」，是继续还是重新开始？</p>
      <div class="center-actions">
        <button class="btn primary" data-a="resume">继续上次</button>
        <button class="btn" data-a="restart">重新选择</button>
      </div>
    </div>`);
    box.addEventListener("click", (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (!a) return;
      if (a === "resume") { runStep(state.step); }
      else { lsDel(SESSION_KEY); state = null; renderVersionPicker(); }
    });
    testRoot.appendChild(box);
    return;
  }
  state = null;
  renderVersionPicker();
}

/* ---------- 游戏模式引流：3 分钟快速挑战（随机三项，快速版参数） ---------- */
function challengeTaskIds() {
  return shuffle(versionTaskList("quick")).slice(0, 3);
}

async function runChallengeFlow(tasks) {
  testRoot.innerHTML = "";
  testRoot.appendChild(el(`<div class="task-title">⚡ 3 分钟快速挑战</div>`));
  testRoot.appendChild(el(`<p class="hint" style="text-align:center">
    随机 3 项任务 · 用快速版参数 · 成绩单独保存，不计入正式测试</p>`));
  const box = el(`<div class="panel"></div>`);
  testRoot.appendChild(box);

  state = newSession();
  state.version = "quick";
  state.challenge = true;
  STEPS = stepsFor("quick");
  const ctl = beginRun();   // 离开挑战页时作废，避免后台继续写 trial

  for (const id of tasks) {
    if (isAborted(ctl)) return;
    const step = ALL_STEPS.find((s) => s.id === id);
    const head = el(`<div class="task-title" style="font-size:15px;color:var(--text-dim)">${step.title}</div>`);
    box.appendChild(head);
    try {
      const mod = await step.mod();
      const m = await mod.run(box, taskCtx(id, ctl));
      if (isAborted(ctl)) return;
      if (m && m.task_id) state.metrics[m.task_id] = m;
    } catch (e) {
      if (isAborted(ctl)) return;
      console.error(e);
    }
    head.remove();
  }
  renderChallengeResult(tasks);
}

function renderChallengeResult(tasks) {
  const { dims } = computeDims(state);
  testRoot.innerHTML = "";
  testRoot.appendChild(el(`<div class="task-title">⚡ 挑战完成！</div>`));
  const box = el(`<div class="panel"></div>`);
  testRoot.appendChild(box);

  const dimRows = Object.entries(dims).filter(([, d]) => d.score !== null)
    .map(([k, d]) => `<div class="dim-item"><div class="dhead"><span>${k}</span><span>${d.score}</span></div>
      <div class="dbar"><i style="width:${d.score}%"></i></div></div>`).join("");
  box.innerHTML = `
    <p class="hint">本次随机任务：${tasks.map((t) => TASK_TITLES[t]).join(" · ")}</p>
    <div class="dim-grid">${dimRows || '<p class="hint">暂无可用维度分</p>'}</div>
    <p class="hint">快速挑战样本很少，分数仅作娱乐参考，不能与标准版/完整版横向比较。</p>
    <div class="export-row" style="margin-top:12px">
      <button class="btn primary" id="ch-card">📤 生成分享卡片</button>
      <button class="btn" id="ch-copy">📋 复制分享文案</button>
    </div>
    <div class="center-actions" style="margin-top:12px">
      <a class="btn" href="#/test/new">📋 去做完整测试</a>
      <button class="btn" id="ch-again">🔄 再来一次</button>
    </div>`;
  box.querySelector("#ch-card").addEventListener("click", () => openShareCard(state, dims));
  box.querySelector("#ch-copy").addEventListener("click", async () => {
    const txt = "我抽了 3 项脑力小游戏挑战，结果挺有意思，你也来试试？ " + siteUrl();
    try {
      await navigator.clipboard.writeText(txt);
      uiToast("已复制分享文案");
    } catch (e) {
      const manual = await uiPrompt({ title: "分享文案", message: "自动复制失败，请手动复制：", value: txt, okText: "复制", rows: 3 });
      if (manual !== null) { try { await navigator.clipboard.writeText(manual); } catch (e2) { /* 用户可手动选中 */ } }
    }
  });
  box.querySelector("#ch-again").addEventListener("click", () => runChallengeFlow(challengeTaskIds()));
}

/* 挑战数据只允许白名单维度名与 0~100 数字分：外部数据一律不直接进 DOM */
const DIM_WHITELIST = ["反应速度", "选择性注意", "抑制控制", "持续注意", "工作记忆", "稳定性"];
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function normalizeChallenge(p) {
  if (!p || !VERSION_ORDER.includes(p.v)) return null;
  const d = (Array.isArray(p.d) ? p.d : [])
    .filter((it) => Array.isArray(it) && it.length >= 2
      && typeof it[0] === "string" && DIM_WHITELIST.includes(it[0])
      && typeof it[1] === "number" && Number.isFinite(it[1]) && it[1] >= 0 && it[1] <= 100)
    .slice(0, 3)
    .map(([k, s]) => [k, Math.round(s)]);
  if (!d.length) return null;      // 全部字段非法 → 按失效链接降级显示
  return { v: p.v, d };
}

/* 挑战好友落地页：只展示对方本次的三个维度分，不排名、无常模 */
function renderChallengeInvite(code) {
  const p = normalizeChallenge(decodeChallenge(code));
  testRoot.innerHTML = "";
  testRoot.appendChild(el(`<div class="task-title">🔥 好友向你发起挑战</div>`));
  const box = el(`<div class="panel"></div>`);
  testRoot.appendChild(box);
  if (!p) {
    box.innerHTML = `<p class="hint">挑战链接已失效或格式不正确。</p>
      <div class="center-actions"><a class="btn primary" href="#/test/new">直接去做测试</a></div>`;
    return;
  }
  const vName = getVersion(p.v).name;
  box.innerHTML = `
    <p class="hint">好友用「${escHtml(vName)}」完成了测试，本次三个维度：</p>
    <div class="dim-grid">
      ${p.d.map(([k, s]) => `<div class="dim-item"><div class="dhead"><span>${escHtml(k)}</span><span>${s}</span></div>
        <div class="dbar"><i style="width:${s}%"></i></div></div>`).join("")}
    </div>
    <p class="hint">这是好友的个人成绩快照，不代表人群排名或常模；你完成同版本后可自行对比。</p>
    <div class="center-actions" style="margin-top:12px">
      <button class="btn primary" id="ci-go">用${vName}接受挑战</button>
      <a class="btn" href="#/">回首页</a>
    </div>`;
  box.querySelector("#ci-go").addEventListener("click", () => {
    lsSet("atc-challenge", JSON.stringify(p));
    location.hash = "#/test";
    setTimeout(() => {
      state = newSession();
      state.version = p.v;
      STEPS = stepsFor(p.v);
      saveSession();
      runStep(0);
    }, 60);
  });
}

/* ---------- 路由 ---------- */
const views = { home: $("#view-home"), settings: $("#view-settings"), test: $("#view-test") };
const backLink = $("#back-link");
const pageTitle = $("#page-title");

/* 站内来源记录：只记用户实际停留过的实质页面，设置页与过渡页 #/test/new 都不覆盖它。
 * 设置页「返回」与「升级版本」取消都据此回退；不用 history.length —— 它无法区分历史
 * 是否属于本站，新标签直开 #/settings 时会退到 about:blank。 */
let prevSiteHash = "#/";

function route() {
  const rawHash = location.hash || "#/";
  const raw = rawHash.replace(/^#\/?/, "");
  const qIndex = raw.indexOf("?");
  const h = qIndex >= 0 ? raw.slice(0, qIndex) : raw;           // 路径部分（不含 query）
  const params = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : "");
  const isNewTest = h === "test/new";
  const name = h === "settings" ? "settings" : (h === "test" || isNewTest || h === "challenge" || h.startsWith("c/")) ? "test" : "home";
  if (name !== "test") abortRun();   // 离开测试页时作废当前步骤并回收任务资源
  if (name !== "settings" && !isNewTest) prevSiteHash = "#/" + h;
  Object.entries(views).forEach(([k, v]) => { v.hidden = k !== name; });
  backLink.hidden = name === "home";
  pageTitle.textContent = name === "settings" ? "⚙️ AI 与隐私设置"
    : isNewTest ? "📋 选择测试版本"
    : h === "challenge" ? "⚡ 3 分钟快速挑战"
    : h.startsWith("c/") ? "🔥 好友挑战"
    : name === "test" ? "📋 标准化测试" : "";
  if (name === "test") {
    if (isNewTest) {
      /* 结果页「去做标准版/完整版」入口：带 ?ver= 预选目标版本。
       * 已有完整结果时先二次确认，取消则回来源页、不删除任何数据。 */
      const reqVer = params.get("ver");
      const targetVer = VERSION_ORDER.includes(reqVer) ? reqVer : DEFAULT_VERSION;
      const savedSnap = loadSession();
      const hasResult = !!((state && state.finished_at) || (savedSnap && savedSnap.finished_at));
      const goPick = () => {
        abortRun();
        lsDel(SESSION_KEY);
        state = null;
        STEPS = ALL_STEPS;
        renderVersionPicker(targetVer);
        window.scrollTo(0, 0);
      };
      if (!hasResult) { goPick(); return; }
      uiConfirm({
        title: "开始新的测试",
        message: "将清空当前测试结果并重新选择版本，确定吗？",
        okText: "确定重新开始",
        danger: true,
      }).then((ok) => {
        if (ok) { goPick(); return; }
        location.hash = (prevSiteHash && prevSiteHash !== "#/test/new") ? prevSiteHash : "#/";
      });
      return;
    }
    if (h === "challenge") runChallengeFlow(challengeTaskIds());
    else if (h.startsWith("c/")) renderChallengeInvite(h.slice(2));
    else startTest();
  }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ---------- 设置页 ---------- */
const CFG_KEY = "atc-ai-cfg";
const DEFAULT_CFG = { proxy: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", temperature: 0.4, timeoutMs: 60000, retries: 2 };
window.__getAiCfg = () => {
  let cfg = { ...DEFAULT_CFG };
  try { Object.assign(cfg, JSON.parse(lsGet(CFG_KEY) || "{}")); } catch (e) {}
  cfg.apiKey = ssGet("atc-ai-key") || "";
  return cfg;
};

(function initSettings() {
  const cfg = window.__getAiCfg();
  $("#cfg-proxy").value = cfg.proxy;
  $("#cfg-base").value = cfg.baseUrl;
  $("#cfg-key").value = cfg.apiKey;
  $("#cfg-temp").value = cfg.temperature;
  $("#cfg-timeout").value = cfg.timeoutMs;
  $("#cfg-retry").value = cfg.retries;

  // 模型下拉 + 自定义输入联动
  const modelSel = $("#cfg-model-sel");
  const modelInput = $("#cfg-model");
  const PRESET_VALS = [...modelSel.options].map((o) => o.value).filter((v) => v !== "__custom__");
  function syncModelUI() {
    if (modelSel.value === "__custom__") {
      modelInput.hidden = false;
    } else {
      modelInput.hidden = true;
      modelInput.value = "";
      const opt = modelSel.selectedOptions[0];
      const base = opt && opt.dataset.base;
      if (base) $("#cfg-base").value = base;   // 选择预设时自动填 Base URL
    }
  }
  // 回显：已保存模型是预设则选中，否则进自定义
  if (PRESET_VALS.includes(cfg.model)) modelSel.value = cfg.model;
  else { modelSel.value = "__custom__"; modelInput.hidden = false; modelInput.value = cfg.model; }
  modelSel.addEventListener("change", syncModelUI);

  // 返回上一页：按站内来源记录回退（结果页/测试页进入则原路返回，状态不丢）；
  // 直接打开或刷新设置页时没有可用来源，回主页，不会退到站外空白页
  $("#cfg-back").addEventListener("click", () => {
    const target = (prevSiteHash && prevSiteHash !== location.hash) ? prevSiteHash : "#/";
    location.hash = target;
  });

  $("#cfg-save").addEventListener("click", () => {
    const c = {
      proxy: $("#cfg-proxy").value.trim(),
      baseUrl: $("#cfg-base").value.trim() || DEFAULT_CFG.baseUrl,
      model: (modelSel.value === "__custom__" ? modelInput.value.trim() : modelSel.value) || DEFAULT_CFG.model,
      temperature: +$("#cfg-temp").value || 0.4,
      timeoutMs: +$("#cfg-timeout").value || 60000,
      retries: Math.max(0, +$("#cfg-retry").value | 0),
    };
    lsSet(CFG_KEY, JSON.stringify(c));
    const key = $("#cfg-key").value.trim();
    if (key) ssSet("atc-ai-key", key);
    else ssDel("atc-ai-key");
    $("#cfg-saved").hidden = false;
  });

  $("#cfg-wipe").addEventListener("click", async () => {
    const ok = await uiConfirm({
      title: "清除本地数据",
      message: "将清空本机的测试进度与结果，确定吗？此操作不可撤销。",
      okText: "确定清除",
      danger: true,
    });
    if (!ok) return;
    lsDel(SESSION_KEY);
    state = newSession();
    uiToast("已清除本地测试数据");
    route();
  });
})();

/* ---------- 导出（供结果页调用） ---------- */
window.__getSession = () => state;
/* 再次测试：清空本次会话，回到版本选择页重新开始 */
window.__restartTest = function () {
  abortRun();
  lsDel(SESSION_KEY);
  state = null;
  STEPS = ALL_STEPS;
  /* hash 相同时赋值不会触发 hashchange，需手动走一次路由 */
  if (location.hash.indexOf("#/test/new") === 0) route();
  else location.hash = "#/test/new";
};
window.__exportSession = function (kind) {
  if (!state) state = loadSession() || newSession();
  const dims = computeDims(state);
  const base = `attention-test_${state.participant_id}_${state.session_id}`;
  if (kind === "json") {
    download(base + ".json", JSON.stringify({
      exported_at: new Date().toISOString(),
      participant_id: state.participant_id,
      session_id: state.session_id,
      version: state.version,
      duration_min: state.duration_min,
      info: state.info,
      metrics: state.metrics,
      dimension_scores: dims.dims,
      trials: state.trials,
    }, null, 2));
  } else {
    const cols = ["participant_id", "session_id", "task_id", "trial_index", "condition", "stimulus", "response", "correct", "rt_ms", "timestamp"];
    const esc = (v) => v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`;
    const rows = state.trials.map((t) => cols.map((c) => esc(t[c])).join(","));
    download(base + "_trials.csv", cols.join(",") + "\n" + rows.join("\n"), "text/csv");
  }
};

route();
