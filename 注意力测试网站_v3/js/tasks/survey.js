/* ⑩ 状态问卷：题目数量由版本配置 ctx.cfg.items 控制（快速 3 项 / 标准 5 项 / 完整 6 项） */
export async function run(box, ctx) {
  const items = (ctx.cfg && Array.isArray(ctx.cfg.items)) ? ctx.cfg.items
    : ["sleep_hours", "caffeine", "fatigue", "screen_time", "mood", "note"];

  const HTML = {
    sleep_hours: `<label class="field"><span>昨晚睡眠时长（小时）</span>
      <input id="q-sleep_hours" type="number" min="0" max="16" step="0.5" placeholder="如 7.5"></label>`,
    caffeine: `<label class="field"><span>过去 6 小时咖啡因摄入</span>
      <select id="q-caffeine"><option>无</option><option>少量（≤1 杯咖啡/茶）</option><option>中等（2~3 杯）</option><option>大量（≥4 杯或含能量饮料）</option></select></label>`,
    fatigue: `<label class="field"><span>当前疲劳程度（1 = 精力充沛，7 = 非常疲惫）：<b id="q-fatigue-v">3</b></span>
      <input id="q-fatigue" type="range" min="1" max="7" step="1" value="3"></label>`,
    screen_time: `<label class="field"><span>今天已连续看屏幕时长（小时）</span>
      <input id="q-screen_time" type="number" min="0" max="16" step="0.5" placeholder="如 4"></label>`,
    mood: `<label class="field"><span>当前情绪/紧张程度（1 = 很放松，7 = 很紧张）：<b id="q-mood-v">3</b></span>
      <input id="q-mood" type="range" min="1" max="7" step="1" value="3"></label>`,
    note: `<label class="field"><span>备注（可选）</span><input id="q-note" type="text" placeholder="如 刚运动完、环境有点吵"></label>`,
  };

  box.innerHTML = `
    <p class="task-instruction">最后 ${items.length} 个关于当前状态的问题（选填，仅用于结果解读参考）。</p>
    ${items.map((k) => HTML[k] || "").join("")}
    <div class="center-actions"><button class="btn primary" id="go">提交并查看结果</button></div>
  `;

  ["fatigue", "mood"].forEach((k) => {
    const s = box.querySelector("#q-" + k);
    if (s) s.addEventListener("input", () => { box.querySelector("#q-" + k + "-v").textContent = s.value; });
  });

  return new Promise((resolve) => {
    box.querySelector("#go").addEventListener("click", () => {
      const info = {};
      const num = (id) => {
        const e = box.querySelector("#" + id);
        return e && e.value ? +e.value : null;
      };
      const val = (id) => {
        const e = box.querySelector("#" + id);
        return e ? e.value : null;
      };
      if (items.includes("sleep_hours")) info.sleep_hours = num("q-sleep_hours");
      if (items.includes("caffeine")) info.caffeine = val("q-caffeine");
      if (items.includes("fatigue")) info.fatigue = num("q-fatigue");
      if (items.includes("screen_time")) info.screen_time = num("q-screen_time");
      if (items.includes("mood")) info.mood = num("q-mood");
      if (items.includes("note")) info.note = (val("q-note") || "").trim() || null;
      resolve({ info });
    });
  });
}
