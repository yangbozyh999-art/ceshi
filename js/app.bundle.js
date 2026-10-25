/* ⚠️ 本文件由 build.js 自动生成，请勿手改；源码在 js/ 目录 */
window.__tasks = window.__tasks || {};
window.addEventListener("error", function (e) {
  var d = document.getElementById("js-error");
  if (d) { d.hidden = false; d.textContent = "⚠️ 脚本错误：" + (e.message || "unknown") + " (@" + String(e.filename || "").split("/").pop() + ":" + e.lineno + ")"; }
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

/* performance.now 计时器：stimulus 呈现时调用 start，响应时调用 take */
function makeClock() {
  const t0 = performance.now();
  return { start: () => performance.now(), take: (t) => Math.round(performance.now() - t) };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

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

/* 线性映射到 0-100：输入 x 在 [lo, hi] 之间，lo→hiScore, hi→loScore */
function scaleScore(x, lo, hi, loScore = 0, hiScore = 100) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return Math.round(hiScore + t * (loScore - hiScore));
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
  const sch = M(m, "schulte");       // median_time_s, errors
  const str = M(m, "stroop");        // accuracy, congruent_median, incongruent_median, stroop_effect
  const can = M(m, "cancel");        // hits, missed, false_hits, speed
  const gng = M(m, "gonogo");        // go_median_rt, omission_rate, commission_rate, cv_go, dprime
  const nb  = M(m, "nback");         // hit_rate, fa_rate, dprime, accuracy
  const ds  = M(m, "digitspan");     // max_span

  /* 各子项分 */
  const sSpeed   = sub(srt.median_rt, 450, 220);
  const gSpeed   = sub(gng.go_median_rt, 650, 300);
  const schScore = sub(sch.median_time_s, 75, 25);           // 5×5 完成时间（秒）
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
  return { dims: out };
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
  box.innerHTML = `
    <div class="consent-text">
      <b>知情同意书</b>
      <p>1. 本测试为<b>自测/娱乐/研究用途，不构成医学诊断</b>。结果不代表任何临床结论。</p>
      <p>2. 测试包含 9 项认知任务，约 15~20 分钟。所有任务数据（反应时、正确率等）仅用于生成本次报告。</p>
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
    box.querySelector("#go").addEventListener("click", () => {
      const age = box.querySelector("#f-age").value;
      const device_type = box.querySelector("#f-device").value;
      const input_method = box.querySelector("#f-input").value;
      const agree = box.querySelector("#ck-agree").checked;
      if (!agree || !age || !device_type || !input_method) {
        box.querySelector("#consent-err").hidden = false;
        return;
      }
      resolve({ info: {
        consent: true,
        age: +age,
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
        <select id="dev-device">${["手机","平板","电脑"].map(d => `<option ${d === detectedDevice ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      <label class="field"><span>主要输入方式确认</span>
        <select id="dev-input">${["触屏","鼠标","键盘"].map(d => `<option ${d === detectedInput ? "selected" : ""}>${d}</option>`).join("")}</select></label>
    </div>
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
/* ③ 简单反应时（热身）：圆点变绿瞬间尽快点击/按空格。练习 5 个不计分，正式 20 个。 */

async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">圆点为灰色时耐心等待；它变绿的<b>瞬间</b>尽快点击屏幕或按空格键。
    练习 5 个（不计分），正式 20 个。抢跑的试次会要求重来。</p>
    <div class="stage" id="srt-stage">
      <div class="gonogo-dot" id="srt-dot" style="background:#94a3b8"></div>
      <div class="final" id="srt-msg">点击下方按钮开始</div>
      <div class="hud"><span class="dim">进度 <b id="srt-n">0</b> / <b id="srt-total">5</b></span></div>
    </div>
    <div class="center-actions"><button class="btn primary" id="srt-go">开始</button></div>
  `;
  const stage = box.querySelector("#srt-stage");
  const dot = box.querySelector("#srt-dot");
  const msg = box.querySelector("#srt-msg");
  const nEl = box.querySelector("#srt-n");
  const totalEl = box.querySelector("#srt-total");

  let awaiting = false, green = false, t0 = 0, timeoutId = null;
  let onRespond = null;   // 当前试次的响应回调

  function pressHandler() { if (onRespond) { const f = onRespond; onRespond = null; f(); } }
  stage.addEventListener("pointerdown", pressHandler);
  const keyHandler = (e) => { if (e.code === "Space") { e.preventDefault(); pressHandler(); } };
  document.addEventListener("keydown", keyHandler);

  /* 单个试次：抢跑自动重试，成功返回 rt（ms） */
  function trial(logged) {
    return new Promise((resolve) => {
      const arm = () => {
        awaiting = true; green = false;
        dot.style.background = "#94a3b8";
        msg.textContent = logged ? "等待变绿…" : "（练习）等待变绿…";
        timeoutId = setTimeout(() => {
          green = true;
          t0 = performance.now();
          dot.style.background = "#16a34a";
          msg.textContent = "现在！";
        }, 1200 + Math.random() * 2300);
        onRespond = () => {
          if (!green) {
            clearTimeout(timeoutId);
            awaiting = false;
            msg.textContent = "太早了！等变绿再点";
            setTimeout(arm, 1000);
            return;
          }
          awaiting = false;
          resolve(Math.round(performance.now() - t0));
        };
      };
      arm();
    });
  }

  await new Promise((res) => box.querySelector("#srt-go").addEventListener("click", res, { once: true }));
  box.querySelector("#srt-go").style.display = "none";

  // 练习 5 个（不记录），进度 1/5 → 5/5
  totalEl.textContent = "5";
  nEl.textContent = "0";
  for (let i = 0; i < 5; i++) {
    const rt = await trial(false);
    nEl.textContent = String(i + 1);
    msg.textContent = "练习：" + rt + " ms";
    await new Promise((r) => setTimeout(r, 700));
  }
  msg.textContent = "练习结束！点击下方按钮进入正式测试";
  const goBtn = box.querySelector("#srt-go");
  goBtn.textContent = "开始正式测试（20 个，计分）";
  goBtn.style.display = "";
  await new Promise((res) => goBtn.addEventListener("click", res, { once: true }));

  // 正式 20 个（记录），进度独立重置 1/20 → 20/20
  totalEl.textContent = "20";
  nEl.textContent = "0";
  const rts = [];
  for (let i = 0; i < 20; i++) {
    const rt = await trial(true);
    rts.push(rt);
    ctx.logTrial("srt", { condition: "simple_rt", stimulus: "green_dot", response: "press", correct: true, rt_ms: rt });
    nEl.textContent = String(i + 1);
    msg.textContent = rt + " ms";
    await new Promise((r) => setTimeout(r, 800));
  }

  document.removeEventListener("keydown", keyHandler);
  return { task_id: "srt", n: rts.length, median_rt: median(rts), sd_rt: sd(rts), cv: cv(rts) };
}

return { run };
})();

/* ===== tasks/schulte.js ===== */
window.__tasks["schulte"] = (() => {
/* ④ 舒尔特方格 5×5：练习 1 盘不计分，正式 3 盘。记录每个数字点击的 trial。 */

async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">按 <b>1 → 25</b> 的顺序依次点击数字，越快越准越好。
    练习 1 盘（不计分），正式 3 盘。</p>
    <div class="hud" style="margin-bottom:10px">
      <span>当前目标：<b id="sc-next">1</b></span>
      <span class="dim">错误：<b id="sc-err">0</b></span>
      <span class="dim">用时：<b id="sc-time">0.0</b>s</span>
    </div>
    <div class="sgrid" id="sc-grid" style="grid-template-columns:repeat(5,1fr)"></div>
    <div class="center-actions"><button class="btn primary" id="sc-go">开始练习盘</button></div>
    <div class="final" id="sc-countdown" style="font-size:48px;text-align:center" hidden></div>
  `;
  const grid = box.querySelector("#sc-grid");
  const nextEl = box.querySelector("#sc-next");
  const errEl = box.querySelector("#sc-err");
  const timeEl = box.querySelector("#sc-time");
  const goBtn = box.querySelector("#sc-go");
  const cdEl = box.querySelector("#sc-countdown");

  const boardTimes = [], boardErrors = [];
  let boardIdx = 0, totalBoards = 4;   // 1 练习 + 3 正式

  function playBoard(isPractice) {
    return new Promise(async (resolve) => {
      let next = 1, errors = 0, lastT = 0, startT = 0, timerIv = null;
      nextEl.textContent = "1";
      errEl.textContent = "0";
      timeEl.textContent = "0.0";
      goBtn.style.display = "none";
      cdEl.hidden = false;
      grid.innerHTML = "";
      /* 准备阶段：方格全部遮盖（不显示数字），避免提前记忆路径 */
      const nums = shuffle([...Array(25).keys()].map((x) => x + 1));
      const cellBtns = nums.map(() => el(`<button class="gcell covered" style="background:#e5e7eb"></button>`));
      cellBtns.forEach((b) => grid.appendChild(b));
      /* 3 秒倒计时 */
      for (let c = 3; c >= 1; c--) {
        cdEl.textContent = String(c);
        await new Promise((r) => setTimeout(r, 1000));
      }
      cdEl.hidden = true;
      /* 揭示数字并立即开始计时 */
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
            ctx.logTrial("schulte", { condition: "5x5", stimulus: String(next), response: String(num), correct: num === next, rt_ms: rt });
          }
          if (num === next) {
            b.classList.add("done");
            nextEl.textContent = String(next);
            next++;
            if (next > 25) {
              clearInterval(timerIv);
              const secs = +((now - startT) / 1000).toFixed(1);
              timeEl.textContent = secs.toFixed(1);   // 停在总用时
              if (!isPractice) { boardTimes.push(secs); boardErrors.push(errors); }
              resolve({ secs, errors });
            }
          } else {
            errors++;
            errEl.textContent = String(errors);
            b.style.background = "#fee2e2";
            setTimeout(() => { b.style.background = ""; }, 200);
          }
        });
      });
    });
  }

  for (let i = 0; i < totalBoards; i++) {
    const isPractice = i === 0;
    goBtn.textContent = isPractice ? "开始练习盘" : `开始正式第 ${i} / 3 盘`;
    goBtn.style.display = "";
    goBtn.textContent = isPractice ? "开始练习盘（不计分）" : `开始正式盘 ${i} / 3`;
    await new Promise((res) => goBtn.addEventListener("click", res, { once: true }));
    const r = await playBoard(isPractice);
    if (isPractice) {
      goBtn.textContent = "练习完成！点击开始正式第 1 盘";
    }
  }
  goBtn.style.display = "none";

  return {
    task_id: "schulte",
    boards: boardTimes.length,
    median_time_s: median(boardTimes),
    total_errors: boardErrors.reduce((a, b) => a + b, 0),
  };
}

return { run };
})();

/* ===== tasks/stroop.js ===== */
window.__tasks["stroop"] = (() => {
/* ⑤ Stroop 色词干扰：判断文字的显示颜色。练习 8 个不计分，正式 60 个（一致/不一致各半，随机）。 */

const COLORS = [
  { name: "红", hex: "#dc2626" },
  { name: "绿", hex: "#16a34a" },
  { name: "蓝", hex: "#2563eb" },
  { name: "黄", hex: "#d97706" },
];

async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">忽略文字含义，<b>只选文字的显示颜色</b>。点击按钮或按键盘 1-4。
    练习 8 个（不计分），正式 60 个。</p>
    <div class="hud" style="margin-bottom:10px">
      <span class="dim">进度 <b id="st-n">0</b> / <b id="st-total">0</b></span>
      <span class="dim">正确 <b id="st-ok">0</b></span>
    </div>
    <div class="stage" style="min-height:170px"><div class="big-stim" id="st-word" style="font-size:56px">？</div></div>
    <div class="ans-btns" style="margin-top:12px" id="st-ans"></div>
  `;
  const wordEl = box.querySelector("#st-word");
  const ansEl = box.querySelector("#st-ans");
  const nEl = box.querySelector("#st-n");
  const okEl = box.querySelector("#st-ok");
  const totalEl = box.querySelector("#st-total");

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

  /* 正式试次：30 一致 + 30 不一致，随机 */
  const formal = shuffle([
    ...Array(30).fill("congruent"),
    ...Array(30).fill("incongruent"),
  ]);

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
        rts[r.condition].push(r.rt);
        if (r.correct) ok++;
        okEl.textContent = String(ok);
      }
    }
    return { rts, ok };
  }

  // 练习
  await block(8, true, Array(8).fill("practice").map(() => Math.random() < 0.5 ? "congruent" : "incongruent"));
  wordEl.textContent = "？"; wordEl.style.color = "var(--text)";
  totalEl.textContent = "60";
  // 正式
  const res = await block(60, false, formal);
  document.removeEventListener("keydown", keyHandler);

  const { rts, ok } = res;
  const cm = median(rts.congruent), im = median(rts.incongruent);
  return {
    task_id: "stroop",
    n: 60,
    accuracy: +(ok / 60).toFixed(3),
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

const COLS = 10, ROWS = 8, TOTAL = COLS * ROWS, TARGET_COUNT = 16;
const TOTAL_TIME = 60;

async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">在 <b>${TOTAL_TIME}</b> 秒内尽快划掉目标数字（每盘恰好 16 个）。
    先来一段 15 秒练习（不计分），再进入正式测试。</p>
    <div class="cx-target-bar" style="background:#fff7ed;border:2px solid #f57c00;border-radius:10px;padding:10px 16px;font-size:22px;font-weight:700;text-align:center;margin-bottom:12px">
      目标数字：<span style="color:#f57c00;font-size:30px" id="cx-target">待开始</span>
      <span style="font-size:13px;color:#9a3412;font-weight:400">（点完 16 个目标立即完成）</span>
    </div>
    <div class="hud" style="margin-bottom:10px">
      <span>时间：<b id="cx-time">--</b>s</span>
      <span>剩余目标：<b id="cx-left">16</b></span>
      <span class="dim">误点：<b id="cx-wrong">0</b></span>
    </div>
    <div class="cx-grid" id="cx-grid" style="grid-template-columns:repeat(10,1fr)"></div>
    <div class="center-actions"><button class="btn primary" id="cx-go">开始练习（15 秒）</button></div>
    <p class="final" id="cx-final"></p>
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
          // 全部 16 个目标划完 → 立即结算（只数目标格，不数全部 80 格）
          if (struckTargets >= TARGET_COUNT && onAllStruck) { const f = onAllStruck; onAllStruck = null; f(); }
        } else {
          b.classList.add("miss"); setTimeout(() => b.classList.remove("miss"), 200);
          wrongEl.textContent = String(+wrongEl.textContent + 1);
        }
        if (currentLog) currentLog({ stimulus: String(d), response: correct ? "strike" : "wrong_strike", condition: "target_task", correct, rt_ms: null });
      });
      grid.appendChild(b);
    });
    return { target, digits, struck };
  }

  let currentLog = null;
  let onAllStruck = null;

  function runRound(seconds, isPractice) {
    return new Promise((resolve) => {
      leftEl.textContent = "16"; wrongEl.textContent = "0";
      finished = false;                 // 每轮重置幂等标记
      grid.style.pointerEvents = "";    // 重新启用方格
      const board = buildBoard();
      const roundStart = performance.now();
      let remaining = seconds;
      timeEl.textContent = String(remaining);
      goBtn.style.display = "none";
      let loggable = !isPractice;
      currentLog = (t) => {
        if (!loggable) return;
        ctx.logTrial("cancel", {
          condition: t.correct ? "target_hit" : "false_positive",
          stimulus: t.stimulus, response: t.response,
          correct: t.correct, rt_ms: t.rt_ms,
        });
      };
      const iv = setInterval(() => {
        remaining--;
        timeEl.textContent = String(remaining);
        if (remaining <= 0) finish(false);
      }, 1000);

      /* 幂等结算：清除定时器 → 禁用方格 → 记录完成时间 → 1 秒后 resolve 进入下一步 */
      function finish(early) {
        if (finished) return;   // 幂等：重复调用直接跳过
        finished = true;
        clearInterval(iv);
        loggable = false;
        grid.style.pointerEvents = "none";   // 禁用方格点击
        const elapsed = early ? (performance.now() - roundStart) / 1000 : seconds;
        const hits = board.digits.filter((d, i) => d === board.target && board.struck[i]).length;
        timeEl.textContent = Math.round(elapsed) + "s（已停止）";
        if (early) finalEl.textContent = "✅ 已完成！";
        setTimeout(() => {
          resolve({ hits, missed: TARGET_COUNT - hits, false_hits: +wrongEl.textContent, early, elapsed });
        }, 1000);
      }
      // 全部 16 个目标划完 → 提前结算
      onAllStruck = () => finish(true);
    });
  }

  const p = await new Promise((res) => goBtn.addEventListener("click", () => res("go"), { once: true }));
  await runRound(15, true);
  finalEl.textContent = "练习结束，点击下方按钮进入正式测试";
  goBtn.textContent = "开始正式测试（60 秒，计分）";
  goBtn.style.display = "";
  await new Promise((res) => goBtn.addEventListener("click", res, { once: true }));
  finalEl.textContent = "正式测试开始";
  const r = await runRound(TOTAL_TIME, false);
  finalEl.textContent = `✅ 已完成！命中 ${r.hits} / 16 · 漏掉 ${r.missed} · 误点 ${r.false_hits}${r.early ? "（提前完成）" : ""}`;

  return {
    task_id: "cancel",
    duration_s: TOTAL_TIME,
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
/* ⑦ Go/No-Go：绿点（Go，80%）尽快点击，红点（No-Go，20%）克制不点。
   练习 12 不计分，正式 100；刺激呈现 600ms，ISI 900~1300ms。 */

async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">出现<b style="color:#16a34a">绿色圆点</b>（Go，80%）→ 尽快点击屏幕或按空格；
    出现<b style="color:#dc2626">红色圆点</b>（No-Go，20%）→ <b>克制住不要点</b>。练习 12 个，正式 100 个。</p>
    <div class="stage" id="gng-stage">
      <div class="gonogo-dot" id="gng-dot" style="background:transparent"></div>
      <div class="final" id="gng-msg">点击开始</div>
      <div class="hud"><span class="dim">进度 <b id="gng-n">0</b> / <b id="gng-total">12</b></span></div>
    </div>
  `;
  const stage = box.querySelector("#gng-stage");
  const dot = box.querySelector("#gng-dot");
  const msg = box.querySelector("#gng-msg");
  const nEl = box.querySelector("#gng-n");
  const totalEl = box.querySelector("#gng-total");

  let onRespond = null;
  function press() { if (onRespond) { const f = onRespond; onRespond = null; f(); } }
  stage.addEventListener("pointerdown", press);
  const keyHandler = (e) => { if (e.code === "Space") { e.preventDefault(); press(); } };
  document.addEventListener("keydown", keyHandler);

  function trial(isGo, isPractice, idx) {
    return new Promise((resolve) => {
      setTimeout(() => {
        dot.style.background = isGo ? "#16a34a" : "#dc2626";
        const t0 = performance.now();
        let responded = false, settled = false;
        onRespond = () => { if (!settled && !responded) responded = true; };
        setTimeout(() => {
          dot.style.background = "transparent";
          settled = true;
          const rt = responded ? Math.round(performance.now() - t0) : null;
          if (!isPractice) {
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

  totalEl.textContent = "12";
  await new Promise((res) => stage.addEventListener("pointerdown", res, { once: true }));
  msg.textContent = "练习开始";
  await runBlock(shuffle([...Array(9).fill(true), ...Array(3).fill(false)]), true);

  msg.textContent = "正式开始（100 个），点击继续";
  totalEl.textContent = "100";
  nEl.textContent = "0";
  await new Promise((res) => stage.addEventListener("pointerdown", res, { once: true }));
  msg.textContent = "";   // 清除"点击继续"提示，正式测试期间不遮挡
  const s = await runBlock(shuffle([...Array(80).fill(true), ...Array(20).fill(false)]), false);
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
/* ⑧ N-back（2-back）：方块位置序列，与前一第 2 个位置相同按「匹配」。练习 12，正式 42（约 30% 匹配）。 */

const N = 2, STIM_MS = 2200, LIT_MS = 900, POS = 9;

async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">方块每 ${STIM_MS / 1000} 秒亮一次。若当前<b>亮起的位置</b>与<b>前面第 ${N} 个</b>位置相同，
    在亮起后尽快点「匹配」（或按空格）；不同则什么都不按。练习 12 个，正式 42 个。</p>
    <div class="nb-grid" id="nb-grid"></div>
    <div class="nb-actions">
      <button class="btn" id="nb-match" hidden>匹配（空格）</button>
      <span class="hud" style="align-self:center"><span class="dim">进度 <b id="nb-n">0</b> / <b id="nb-total">12</b></span></span>
    </div>
    <div class="center-actions" style="margin-top:10px"><button class="btn primary" id="nb-start">▶ 开始</button></div>
  `;
  const grid = box.querySelector("#nb-grid");
  const matchBtn = box.querySelector("#nb-match");
  const startBtn = box.querySelector("#nb-start");
  const nEl = box.querySelector("#nb-n");
  const totalEl = box.querySelector("#nb-total");
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

  let responded = false, resolveStim = null;

  function playSeq(seq, isPractice) {
    return new Promise(async (resolve) => {
      nEl.textContent = "0";   // 每阶段进度独立重置
      const stats = { hits: 0, misses: 0, fas: 0, corrRej: 0, nTargets: 0, nNonTargets: 0, seq };
      for (let i = 0; i < seq.length; i++) {
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
          if (!isPractice) {
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
        document.addEventListener("keydown", keyHandler, { once: true });
        await new Promise((r) => setTimeout(r, LIT_MS));
        cells[pos].classList.remove("lit");
        // 剩余响应窗口
        await new Promise((r) => setTimeout(r, STIM_MS - LIT_MS));
        matchBtn.removeEventListener("click", btnHandler);
        document.removeEventListener("keydown", keyHandler);
        if (!responded) {
          if (isTarget) stats.misses++;
          else stats.corrRej++;
          if (!isPractice) {
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

  totalEl.textContent = "12";
  /* 准备页：先点"开始"，之后才显示"匹配（空格）"进入试次 */
  await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
  startBtn.style.display = "none";
  matchBtn.hidden = false;
  await playSeq(genSeq(12, 0.3), true);

  totalEl.textContent = "42";
  nEl.textContent = "0";
  await new Promise((res) => matchBtn.addEventListener("click", res, { once: true }));
  const s = await playSeq(genSeq(42, 0.3), false);

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
/* ⑨ 数字广度（顺向）：练习 1 次（3 位），正式从 4 位起，每个长度 2 次机会，双败结束。 */

async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">屏幕会逐个显示一串数字（每位约 0.8 秒），显示完毕后<b>按同样顺序</b>输入。
    从 4 位开始，每个长度有 2 次机会，连续两次失败即结束。练习 1 次（3 位，不计分）。</p>
    <div class="stage">
      <div class="digit-show" id="ds-show">&nbsp;</div>
      <div class="final" id="ds-msg">点击开始</div>
      <div class="pad" id="ds-pad" style="visibility:hidden"></div>
    </div>
  `;
  const showEl = box.querySelector("#ds-show");
  const msgEl = box.querySelector("#ds-msg");
  const pad = box.querySelector("#ds-pad");
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

  msgEl.textContent = "点击开始练习";
  await new Promise((res) => box.addEventListener("click", res, { once: true }));
  await oneTrial(3, true);

  let span = 3, failsAtLen = 0, len = 4;
  while (len <= 12) {
    msgEl.textContent = `${len} 位 · 第 1 次机会，点击继续`;
    await new Promise((res) => box.addEventListener("click", res, { once: true }));
    const ok1 = await oneTrial(len, false);
    if (ok1) { span = len; len++; failsAtLen = 0; continue; }
    msgEl.textContent = `${len} 位 · 第 2 次机会，点击继续`;
    await new Promise((res) => box.addEventListener("click", res, { once: true }));
    const ok2 = await oneTrial(len, false);
    if (ok2) { span = len; len++; failsAtLen = 0; continue; }
    break;   // 双败结束
  }
  msgEl.textContent = `测试结束，你的数字广度：${span} 位`;

  return { task_id: "digitspan", max_span: span };
}

return { run };
})();

/* ===== tasks/survey.js ===== */
window.__tasks["survey"] = (() => {
/* ⑩ 疲劳/睡眠/咖啡因问卷 */
async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">最后几个关于当前状态的问题（选填，仅用于结果解读参考）。</p>
    <label class="field"><span>昨晚睡眠时长（小时）</span>
      <input id="q-sleep" type="number" min="0" max="16" step="0.5" placeholder="如 7.5"></label>
    <label class="field"><span>过去 6 小时咖啡因摄入</span>
      <select id="q-caffeine"><option>无</option><option>少量（≤1 杯咖啡/茶）</option><option>中等（2~3 杯）</option><option>大量（≥4 杯或含能量饮料）</option></select></label>
    <label class="field"><span>当前疲劳程度（1 = 精力充沛，7 = 非常疲惫）：<b id="q-fatigue-v">3</b></span>
      <input id="q-fatigue" type="range" min="1" max="7" step="1" value="3"></label>
    <label class="field"><span>备注（可选）</span><input id="q-note" type="text" placeholder="如 刚运动完、环境有点吵"></label>
    <div class="center-actions"><button class="btn primary" id="go">提交并查看结果</button></div>
  `;
  const slider = box.querySelector("#q-fatigue");
  slider.addEventListener("input", () => { box.querySelector("#q-fatigue-v").textContent = slider.value; });

  return new Promise((resolve) => {
    box.querySelector("#go").addEventListener("click", () => {
      resolve({ info: {
        sleep_hours: box.querySelector("#q-sleep").value ? +box.querySelector("#q-sleep").value : null,
        caffeine: box.querySelector("#q-caffeine").value,
        fatigue: +slider.value,
        note: box.querySelector("#q-note").value.trim() || null,
      }});
    });
  });
}

return { run };
})();

/* ===== tasks/results.js ===== */
window.__tasks["results"] = (() => {
/* ⑪ 结果汇总：客观维度分 + 任务指标表 + AI 解释（失败降级）+ JSON/CSV 导出 */



async function run(box, ctx) {
  const state = window.__getSession();
  state.finished_at = new Date().toISOString();
  localStorage.setItem("atc-session", JSON.stringify(state));

  const { dims } = computeDims(state);
  const info = state.info;

  box.innerHTML = `
    <div class="task-title">测试完成 ✅</div>
    <p class="hint">参与者 ${state.participant_id} · 会话 ${state.session_id} · 完成于 ${new Date().toLocaleString()}</p>
    <div class="center-actions" style="margin:10px 0">
      <button class="btn" id="again-btn">🔄 再次测试</button>
    </div>

    <h3 style="margin:16px 0 4px">六维度客观分（0-100，规则层计算）</h3>
    <div class="dim-grid" id="dim-grid"></div>

    <h3 style="margin:16px 0 4px">各任务指标</h3>
    <table class="metrics" id="metrics-table"></table>

    <h3 style="margin:16px 0 4px">AI 综合解释</h3>
    <div class="ai-box">
      <p class="hint" style="margin-bottom:8px">
        <b>推荐方式（无需任何配置）：</b>点击下方按钮复制测试报告和提示词，粘贴到任意 AI 网站（如 ChatGPT、Kimi、DeepSeek）即可获得解读。
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
          <div class="hint" style="margin-bottom:8px">AI 只读取上方的结构化指标与客观分，生成解释与建议；<b>不会修改客观分，也不构成医学诊断</b>。
          未配置时请前往 <a href="#/settings">⚙️ 设置</a>。返回后点击下方按钮。</div>
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

  /* 维度分渲染 */
  const dimGrid = box.querySelector("#dim-grid");
  for (const [name, d] of Object.entries(dims)) {
    dimGrid.appendChild(el(`<div class="dim-item">
      <div class="dhead"><span>${name}</span><span class="lvl-${d.level === "优秀" ? "高" : d.level === "待提升" ? "低" : "中"}">${d.score === null ? "—" : d.score + " · " + d.level}</span></div>
      <div class="dbar"><i style="width:${d.score ?? 0}%"></i></div>
      <div class="dnote">${d.score === null ? "该维度数据缺失" : ""}</div>
    </div>`));
  }

  /* 指标表渲染 */
  const TASK_NAMES = {
    srt: "简单反应时", schulte: "舒尔特 5×5", stroop: "Stroop", cancel: "数字划消",
    gonogo: "Go/No-Go", nback: "2-back", digitspan: "数字广度",
  };
  const FMT = {
    srt: (m) => `中位 ${m.median_rt}ms · SD ${m.sd_rt}ms · CV ${m.cv}`,
    schulte: (m) => `中位 ${m.median_time_s}s · 总错误 ${m.total_errors}`,
    stroop: (m) => `正确率 ${(m.accuracy * 100).toFixed(0)}% · 一致 ${m.congruent_median}ms · 不一致 ${m.incongruent_median}ms · 干扰量 ${m.stroop_effect}ms`,
    cancel: (m) => `命中 ${m.hits}/16 · 漏划 ${m.missed} · 误划 ${m.false_hits} · 速度 ${m.speed}/min`,
    gonogo: (m) => `Go 中位 ${m.go_median_rt}ms · 漏报率 ${(m.omission_rate * 100).toFixed(0)}% · 虚报率 ${(m.commission_rate * 100).toFixed(0)}% · d' ${m.dprime}`,
    nback: (m) => `命中率 ${(m.hit_rate * 100).toFixed(0)}% · 虚报率 ${(m.fa_rate * 100).toFixed(0)}% · d' ${m.dprime} · 总正确率 ${(m.accuracy * 100).toFixed(0)}%`,
    digitspan: (m) => `最大广度 ${m.max_span} 位`,
  };
  const table = box.querySelector("#metrics-table");
  for (const [id, name] of Object.entries(TASK_NAMES)) {
    const m = state.metrics[id];
    const cell = m
      ? m.skipped ? '<span style="color:#b45309">⏭ 该任务已跳过（开发模式），未计分</span>' : FMT[id](m)
      : '<span class="hint">未完成</span>';
    const tr = el(`<tr><td>${name}</td><td>${cell}</td></tr>`);
    table.appendChild(tr);
  }

  /* 导出 */
  box.querySelector("#exp-json").addEventListener("click", () => window.__exportSession("json"));
  box.querySelector("#exp-csv").addEventListener("click", () => window.__exportSession("csv"));

  /* 再次测试：确认后清空任务数据与结果（保留基本信息），重新开始 */
  box.querySelector("#again-btn").addEventListener("click", () => {
    if (!confirm("将清空当前测试结果并重新开始测试，确定吗？（基本信息会保留）")) return;
    window.__restartTest();
  });

  /* ---------- 手动 AI 辅助解读：报告文本 + 提示词模板 ---------- */
  const TASK_NAMES_CN = {
    srt: "简单反应时", schulte: "舒尔特 5×5", stroop: "Stroop 色词干扰", cancel: "数字划消",
    gonogo: "Go/No-Go", nback: "2-back 工作记忆", digitspan: "数字广度",
  };
  function buildReportText() {
    const lines = [];
    lines.push("【注意力与记忆力测试报告】");
    lines.push(`参与者 ${state.participant_id} · 会话 ${state.session_id} · 完成于 ${new Date(state.finished_at || Date.now()).toLocaleString()}`);
    lines.push("");
    lines.push("一、六维度客观分（0-100，由网站规则计算）：");
    for (const [name, d] of Object.entries(dims)) {
      lines.push(`- ${name}：${d.score === null ? "数据缺失" : d.score + "（" + d.level + "）"}`);
    }
    lines.push("");
    lines.push("二、任务完成情况：");
    for (const [id, name] of Object.entries(TASK_NAMES)) {
      const m = state.metrics[id];
      if (!m) lines.push(`- ${name}：未完成`);
      else if (m.skipped) lines.push(`- ${name}：已跳过（未计分）`);
      else lines.push(`- ${name}：${FMT[id](m)}`);
    }
    const p = state.info || {};
    lines.push("");
    lines.push(`三、背景信息：年龄 ${p.age ?? "未填"} · 睡眠 ${p.sleep_hours ?? "未填"} 小时 · 咖啡因 ${p.caffeine ?? "未填"} · 疲劳度 ${p.fatigue ?? "未填"}/7`);
    lines.push("");
    lines.push("⚕️ 声明：本测试为自测/娱乐/研究用途，不构成医学诊断。如有困扰请咨询专业医疗机构。");
    return lines.join("\n");
  }
  function buildPromptText() {
    return [
      "你是一名认知测评解读助手。请基于下面这份「注意力与记忆力测试报告」，用通俗语言完成：",
      "1. 总评：2-3 句概括整体表现；",
      "2. 维度解读：逐条解释每个维度分数的含义与可能影响因素；",
      "3. 建议：给出 3-5 条可操作的日常改善建议；",
      "4. 置信度说明：指出哪些结果可能受设备、环境、状态（睡眠/咖啡因/疲劳）影响。",
      "",
      "硬性要求：不得做出任何医学诊断或建议用药；不得修改或重算客观分数；语气客观中立。",
      "",
      buildReportText(),
    ].join("\n");
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
  const copyOk = box.querySelector("#copy-ok");
  let copyTimer = null;
  function showCopyOk() {
    copyOk.hidden = false;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyOk.hidden = true; }, 2000);
  }
  box.querySelector("#copy-report").addEventListener("click", async () => {
    if (await copyText(buildReportText())) showCopyOk();
    else alert("复制失败，请手动选中复制。");
  });
  box.querySelector("#copy-prompt").addEventListener("click", async () => {
    if (await copyText(buildPromptText())) showCopyOk();
    else alert("复制失败，请手动选中复制。");
  });

  /* 常用 AI 网站链接：顺序与 URL 集中在 js/ai-links-config.js，新窗口打开 */
  const linksRow = box.querySelector("#ai-links-row");
  for (const l of (window.AI_LINKS || [])) {
    if (l.url) {
      linksRow.appendChild(el(`<a class="btn" href="${l.url}" target="_blank" rel="noopener">${l.name}</a>`));
    } else {
      linksRow.appendChild(el(`<span class="btn" style="opacity:.5;cursor:not-allowed" title="官方网址待确认">${l.name}（待确认）</span>`));
    }
  }

  /* AI 解释（失败降级） */
  const aiBody = box.querySelector("#ai-body");
  const aiBtn = box.querySelector("#ai-go");
  aiBtn.addEventListener("click", async () => {
    aiBtn.disabled = true;
    aiBody.innerHTML = '<span class="hint">AI 生成中…（最长可能需要 1 分钟）</span>';
    try {
      const report = await generateReport(buildAiPayload(state, dims));
      let html = `<b>总评：</b>${escapeHtml(report.overall || "--")}\n\n`;
      html += "<b>维度解读：</b>\n" + Object.entries(report.dimensions || {})
        .map(([k, v]) => `· ${k}：${v}`).join("\n") + "\n\n";
      html += "<b>建议：</b>\n" + (report.suggestions || []).map((s) => `· ${s}`).join("\n");
      html += `\n\n<span class="hint">置信度说明：${escapeHtml(report.confidence_note || "--")}</span>`;
      aiBody.innerHTML = html.replace(/\n/g, "<br>");
      aiBtn.textContent = "重新生成";
    } catch (e) {
      const noKey = String(e.message || e).includes("NO_KEY");
      aiBody.innerHTML = `<span class="ai-err">⚠️ AI 解释暂不可用${noKey ? "（未配置 AI，请前往 ⚙️ 设置；或使用后端代理）" : "（" + escapeHtml(String(e.message || e)) + "）"}。</span><br>
        <span class="hint">以下客观评分与导出数据不受影响。</span>`;
      aiBtn.textContent = "重试";
    }
    aiBtn.disabled = false;
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  { id: "consent",   title: "知情同意与基本信息", mod: () => Promise.resolve({ run: window.__tasks["consent"].run }),  task: false },
  { id: "device",    title: "设备与输入方式检查", mod: () => Promise.resolve({ run: window.__tasks["device"].run }),   task: false },
  { id: "srt",       title: "简单反应时（热身）", mod: () => Promise.resolve({ run: window.__tasks["srt"].run }),      task: true  },
  { id: "schulte",   title: "舒尔特方格 5×5",     mod: () => Promise.resolve({ run: window.__tasks["schulte"].run }),  task: true  },
  { id: "stroop",    title: "Stroop 色词干扰",    mod: () => Promise.resolve({ run: window.__tasks["stroop"].run }),   task: true  },
  { id: "cancel",    title: "数字划消",           mod: () => Promise.resolve({ run: window.__tasks["cancel"].run }),   task: true  },
  { id: "gonogo",    title: "Go / No-Go",         mod: () => Promise.resolve({ run: window.__tasks["gonogo"].run }),   task: true  },
  { id: "nback",     title: "N-back（2-back）",   mod: () => Promise.resolve({ run: window.__tasks["nback"].run }),    task: true  },
  { id: "digitspan", title: "数字广度",           mod: () => Promise.resolve({ run: window.__tasks["digitspan"].run }),task: true  },
  { id: "survey",    title: "状态问卷",           mod: () => Promise.resolve({ run: window.__tasks["survey"].run }),   task: false },
  { id: "results",   title: "结果汇总与 AI 解释", mod: () => Promise.resolve({ run: window.__tasks["results"].run }),  task: false },
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
