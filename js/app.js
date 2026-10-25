/* ==================== 应用：路由 / 测试流程状态机 / 存储 / 导出 ==================== */
import { $, el, download } from "./helpers.js";
import { computeDims } from "./scoring.js";

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
    started_at: new Date().toISOString(),
    finished_at: null,
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

/* 记录一条 trial 级原始数据（字段严格按规范） */
function logTrial(task_id, trial) {
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

/* ---------- 测试流程步骤 ---------- */
const STEPS = [
  { id: "consent",   title: "知情同意与基本信息", mod: () => import("./tasks/consent.js"),  task: false },
  { id: "device",    title: "设备与输入方式检查", mod: () => import("./tasks/device.js"),   task: false },
  { id: "srt",       title: "简单反应时（热身）", mod: () => import("./tasks/srt.js"),      task: true  },
  { id: "schulte",   title: "舒尔特方格 5×5",     mod: () => import("./tasks/schulte.js"),  task: true  },
  { id: "stroop",    title: "Stroop 色词干扰",    mod: () => import("./tasks/stroop.js"),   task: true  },
  { id: "cancel",    title: "数字划消",           mod: () => import("./tasks/cancel.js"),   task: true  },
  { id: "gonogo",    title: "Go / No-Go",         mod: () => import("./tasks/gonogo.js"),   task: true  },
  { id: "nback",     title: "N-back（2-back）",   mod: () => import("./tasks/nback.js"),    task: true  },
  { id: "digitspan", title: "数字广度",           mod: () => import("./tasks/digitspan.js"),task: true  },
  { id: "survey",    title: "状态问卷",           mod: () => import("./tasks/survey.js"),   task: false },
  { id: "results",   title: "结果汇总与 AI 解释", mod: () => import("./tasks/results.js"),  task: false },
];

const taskCtx = () => ({
  logTrial: logTrial,
  info: state.info,
});

/* ---------- 测试流程渲染 ---------- */
const testRoot = $("#test-root");

function renderProgress(i) {
  const pct = Math.round((i / (STEPS.length - 1)) * 100);
  return el(`<div class="progress"><div class="pbar"><i style="width:${pct}%"></i></div><span>${i + 1} / ${STEPS.length}</span></div>`);
}

async function runStep(i) {
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
    const metrics = await mod.run(box, taskCtx());
    if (metrics) {
      Object.assign(state.info, metrics.info || {});
      if (metrics.task_id) state.metrics[metrics.task_id] = metrics;
      saveSession();
      nextStep(i);
    }
  } catch (err) {
    console.error(err);
    box.innerHTML = `<p style="color:var(--danger)">⚠️ 本步骤加载出错：${String(err && err.message || err)}<br>
      <span class="hint">请截图反馈；或刷新页面重试（进度已保存，可继续）。</span></p>`;
  }
}

function nextStep(i) {
  if (i + 1 >= STEPS.length) { return; }
  const next = STEPS[i + 1];
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

async function startTest() {
  /* 已完成的会话（从设置页返回 / 刷新页面后）：直接重新渲染结果，不重置会话 */
  const doneSaved = (!state || state.finished_at) ? loadSession() : null;
  if (!state && doneSaved && doneSaved.finished_at) {
    state = doneSaved;
    runStep(STEPS.length - 1);
    return;
  }
  if (state && state.finished_at) {
    runStep(STEPS.length - 1);
    return;
  }
  const saved = loadSession();
  if (saved && saved.step > 0) {
    testRoot.innerHTML = "";
    const box = el(`<div class="panel rest-box">
      <h2>发现未完成的测试</h2>
      <p>上次进行到「${STEPS[Math.min(saved.step, STEPS.length - 1)].title}」，是继续还是重新开始？</p>
      <div class="center-actions">
        <button class="btn primary" data-a="resume">继续上次</button>
        <button class="btn" data-a="restart">重新开始</button>
      </div>
    </div>`);
    box.addEventListener("click", (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (!a) return;
      if (a === "resume") { state = saved; runStep(state.step); }
      else { state = newSession(); saveSession(); runStep(0); }
    });
    testRoot.appendChild(box);
    return;
  }
  state = newSession();
  saveSession();
  runStep(0);
}

/* ---------- 路由 ---------- */
const views = { home: $("#view-home"), settings: $("#view-settings"), test: $("#view-test") };
const backLink = $("#back-link");
const pageTitle = $("#page-title");

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const name = h === "settings" ? "settings" : h === "test" ? "test" : "home";
  Object.entries(views).forEach(([k, v]) => { v.hidden = k !== name; });
  backLink.hidden = name === "home";
  pageTitle.textContent = name === "settings" ? "⚙️ AI 与隐私设置" : name === "test" ? "📋 标准化测试" : "";
  if (name === "test") startTest();
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

  // 返回上一页：从结果页/测试页进入则原路返回（状态不丢），直接打开设置则回主页
  $("#cfg-back").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.hash = "#/";
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

  $("#cfg-wipe").addEventListener("click", () => {
    if (!confirm("确定清除全部本地测试数据（进度、结果、排行榜不受影响）？")) return;
    lsDel(SESSION_KEY);
    state = newSession();
    alert("已清除。");
    route();
  });
})();

/* ---------- 导出（供结果页调用） ---------- */
window.__getSession = () => state;
/* 再次测试：保留基本信息（info），清空任务数据与结果，从头开始 */
window.__restartTest = function () {
  const keepInfo = state ? state.info : {};
  state = newSession();
  state.info = keepInfo;
  saveSession();
  runStep(0);
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
