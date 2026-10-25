/* ⑨ 数字广度（顺向）：练习 1 次（3 位），正式从 4 位起，每个长度 2 次机会，双败结束。 */
import { el, shuffle, wait } from "../helpers.js";

export async function run(box, ctx) {
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
