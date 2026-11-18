/* ⑦ Go/No-Go：绿点（Go）尽快点击，红点（No-Go）克制不点。
   练习/正式试次与 Go 比例由版本配置决定；刺激呈现 600ms，ISI 900~1300ms。 */
import { median, sd, cv, shuffle, dprime, onCleanup } from "../helpers.js";

export async function run(box, ctx) {
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
