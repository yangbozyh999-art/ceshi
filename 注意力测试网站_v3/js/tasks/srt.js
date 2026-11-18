/* ③ 简单反应时（热身）：圆点变绿瞬间尽快点击/按空格。练习/正式试次由版本配置决定。 */
import { el, median, sd, cv, onCleanup } from "../helpers.js";

export async function run(box, ctx) {
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
