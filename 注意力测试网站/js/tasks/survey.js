/* ⑩ 疲劳/睡眠/咖啡因问卷 */
export async function run(box, ctx) {
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
