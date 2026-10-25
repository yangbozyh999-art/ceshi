/* ④ 舒尔特方格 5×5：练习 1 盘不计分，正式 3 盘。记录每个数字点击的 trial。 */
import { el, median, shuffle } from "../helpers.js";

export async function run(box, ctx) {
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
