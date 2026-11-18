/* ⑨ 数字广度（顺向）：练习 1 次（不计分），正式按版本配置的序列数上限推进，每长度 2 次机会。 */
import { el, shuffle, wait } from "../helpers.js";

export async function run(box, ctx) {
  const P = ctx.cfg || {};
  const MAX_TRIALS = P.maxTrials ?? 8;
  const START_LEN = P.startLen ?? 3;
  box.innerHTML = `
    <p class="task-instruction">屏幕会逐个显示一串数字（每位约 0.8 秒），显示完毕后<b>按同样顺序</b>输入。
    从 ${START_LEN + 1} 位开始，每个长度有 2 次机会，连续两次失败即结束；本版本最多 ${MAX_TRIALS} 个正式序列。
    练习 1 次（${START_LEN} 位，不计分）。</p>
    <div class="stage">
      <div class="digit-show" id="ds-show">&nbsp;</div>
      <div class="final" id="ds-msg">点击下方按钮开始</div>
      <div class="pad" id="ds-pad" style="visibility:hidden"></div>
    </div>
    <div class="center-actions"><button class="btn primary" id="ds-start">▶ 开始</button></div>
    <p class="task-status" id="ds-status">未开始</p>
  `;
  const showEl = box.querySelector("#ds-show");
  const msgEl = box.querySelector("#ds-msg");
  const pad = box.querySelector("#ds-pad");
  const startBtn = box.querySelector("#ds-start");
  const statusEl = box.querySelector("#ds-status");
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

  /* 统一入口：显示按钮 → 等待点击 → 隐藏（避免整块面板随便点就开跑） */
  async function gate(text, label) {
    msgEl.textContent = text;
    startBtn.textContent = label || "▶ 继续";
    startBtn.style.display = "";
    await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
    startBtn.style.display = "none";     // 点击后隐藏，防止重复点击
    statusEl.textContent = "已开始";
  }

  await gate("点击下方按钮开始练习", "▶ 开始");
  await oneTrial(START_LEN, true);

  let span = START_LEN, failsAtLen = 0, len = START_LEN + 1, trials = 0;
  while (len <= 12 && trials < MAX_TRIALS) {
    await gate(`${len} 位 · 第 1 次机会，点击继续`);
    const ok1 = await oneTrial(len, false); trials++;
    if (ok1) { span = len; len++; failsAtLen = 0; continue; }
    if (trials >= MAX_TRIALS) break;   // 先判上限：达到上限直接结束，不再弹一次空的「第 2 次机会」
    await gate(`${len} 位 · 第 2 次机会，点击继续`);
    const ok2 = await oneTrial(len, false); trials++;
    if (ok2) { span = len; len++; failsAtLen = 0; continue; }
    break;   // 双败结束
  }
  msgEl.textContent = `测试结束，你的数字广度：${span} 位`;
  statusEl.textContent = "✅ 已完成";
  statusEl.classList.add("done");

  return { task_id: "digitspan", max_span: span };
}
