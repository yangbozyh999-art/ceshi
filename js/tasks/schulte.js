/* ④ 舒尔特方格：练习 1 盘不计分 + 正式 N 盘；盘面大小与盘数由版本配置决定（4×4 / 5×5）。 */
import { el, median, shuffle, onCleanup } from "../helpers.js";

export async function run(box, ctx) {
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
