/* ==================== 应用：路由 / 测试流程状态机 / 存储 / 导出 ==================== */
import { $, el, download, shuffle, runCleanups } from "./helpers.js";
import { uiConfirm, uiPrompt, uiToast } from "./ui.js";
import { computeDims } from "./scoring.js";
import { VERSIONS, VERSION_ORDER, DEFAULT_VERSION, VERSION_NOTE, getVersion, getVersionTaskCfg, versionTaskList, TASK_ORDER } from "./versions.js";

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
  { id: "consent",   title: "知情同意与基本信息", mod: () => import("./tasks/consent.js"),  task: false },
  { id: "device",    title: "设备与输入方式检查", mod: () => import("./tasks/device.js"),   task: false },
  { id: "srt",       title: "简单反应时（热身）", mod: () => import("./tasks/srt.js"),      task: true  },
  { id: "schulte",   title: "舒尔特方格",         mod: () => import("./tasks/schulte.js"),  task: true  },
  { id: "stroop",    title: "Stroop 色词干扰",    mod: () => import("./tasks/stroop.js"),   task: true  },
  { id: "cancel",    title: "数字划消",           mod: () => import("./tasks/cancel.js"),   task: true  },
  { id: "gonogo",    title: "Go / No-Go",         mod: () => import("./tasks/gonogo.js"),   task: true  },
  { id: "nback",     title: "N-back（2-back）",   mod: () => import("./tasks/nback.js"),    task: true  },
  { id: "digitspan", title: "数字广度",           mod: () => import("./tasks/digitspan.js"),task: true  },
  { id: "survey",    title: "状态问卷",           mod: () => import("./tasks/survey.js"),   task: false },
  { id: "results",   title: "结果汇总与 AI 解释", mod: () => import("./tasks/results.js"),  task: false },
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
