/* ⑥ 数字划消（60 秒）：每盘固定 16 个目标数字。练习 15 秒不计分，正式 60 秒。 */
import { el } from "../helpers.js";

const COLS = 10, ROWS = 8, TOTAL = COLS * ROWS, TARGET_COUNT = 16;
const TOTAL_TIME = 60;

export async function run(box, ctx) {
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
