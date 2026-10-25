/* ③ 简单反应时（热身）：圆点变绿瞬间尽快点击/按空格。练习 5 个不计分，正式 20 个。 */
import { el, median, sd, cv } from "../helpers.js";

export async function run(box, ctx) {
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
