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
