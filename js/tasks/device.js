/* ② 设备与输入方式检查：自动检测 + 交互确认 */
import { el, $ } from "../helpers.js";

export async function run(box, ctx) {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const w = window.innerWidth, h = window.innerHeight;
  const detectedDevice = Math.min(w, h) < 500 ? "手机" : Math.min(w, h) < 900 ? "平板" : "电脑";
  const detectedInput = coarse && !fine ? "触屏" : fine && !coarse ? "鼠标" : "混合（触屏+鼠标/触控板）";
  let keyboardOk = !coarse;   // 触屏设备可能没有实体键盘，检测到按键则确认

  /* 选中优先级：同意页的显式选择 → 自动检测（仅当取值在该下拉的合法项内）→ 首项。
   * 检测值可能落在选项之外（如"混合（触屏+鼠标/触控板）"），此时不得用它覆盖用户选择。 */
  const DEVICES = ["手机", "平板", "电脑"];
  const INPUTS = ["触屏", "鼠标", "键盘"];
  const userDevice = (ctx.info && ctx.info.device_type) || "";
  const userInput = (ctx.info && ctx.info.input_method) || "";
  const selDevice = DEVICES.includes(userDevice) ? userDevice
    : (DEVICES.includes(detectedDevice) ? detectedDevice : DEVICES[0]);
  const selInput = INPUTS.includes(userInput) ? userInput
    : (INPUTS.includes(detectedInput) ? detectedInput : INPUTS[0]);

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
        <select id="dev-device">${DEVICES.map(d => `<option ${d === selDevice ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      <label class="field"><span>主要输入方式确认</span>
        <select id="dev-input">${INPUTS.map(d => `<option ${d === selInput ? "selected" : ""}>${d}</option>`).join("")}</select></label>
    </div>
    <p class="hint" style="text-align:center;margin-top:6px">自动检测仅作建议，以你在这里（或同意页）的选择为准。</p>
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
