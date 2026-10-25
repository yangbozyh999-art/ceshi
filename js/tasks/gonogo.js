/* ⑦ Go/No-Go：绿点（Go，80%）尽快点击，红点（No-Go，20%）克制不点。
   练习 12 不计分，正式 100；刺激呈现 600ms，ISI 900~1300ms。 */
import { median, sd, cv, shuffle, dprime } from "../helpers.js";

export async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">出现<b style="color:#16a34a">绿色圆点</b>（Go，80%）→ 尽快点击屏幕或按空格；
    出现<b style="color:#dc2626">红色圆点</b>（No-Go，20%）→ <b>克制住不要点</b>。练习 12 个，正式 100 个。</p>
    <div class="stage" id="gng-stage">
      <div class="gonogo-dot" id="gng-dot" style="background:transparent"></div>
      <div class="final" id="gng-msg">点击开始</div>
      <div class="hud"><span class="dim">进度 <b id="gng-n">0</b> / <b id="gng-total">12</b></span></div>
    </div>
  `;
  const stage = box.querySelector("#gng-stage");
  const dot = box.querySelector("#gng-dot");
  const msg = box.querySelector("#gng-msg");
  const nEl = box.querySelector("#gng-n");
  const totalEl = box.querySelector("#gng-total");

  let onRespond = null;
  function press() { if (onRespond) { const f = onRespond; onRespond = null; f(); } }
  stage.addEventListener("pointerdown", press);
  const keyHandler = (e) => { if (e.code === "Space") { e.preventDefault(); press(); } };
  document.addEventListener("keydown", keyHandler);

  function trial(isGo, isPractice, idx) {
    return new Promise((resolve) => {
      setTimeout(() => {
        dot.style.background = isGo ? "#16a34a" : "#dc2626";
        const t0 = performance.now();
        let responded = false, settled = false;
        onRespond = () => { if (!settled && !responded) responded = true; };
        setTimeout(() => {
          dot.style.background = "transparent";
          settled = true;
          const rt = responded ? Math.round(performance.now() - t0) : null;
          if (!isPractice) {
            ctx.logTrial("gonogo", {
              condition: isGo ? "go" : "nogo",
              stimulus: isGo ? "green_dot" : "red_dot",
              response: responded ? "press" : "no_response",
              correct: isGo ? responded : !responded,
              rt_ms: isGo && responded ? rt : null,
            });
          }
          resolve({ responded, rt });
          nEl.textContent = String(idx + 1);
        }, 600);
      }, 900 + Math.random() * 400);
    });
  }

  async function runBlock(seq, isPractice) {
    const stats = { goRts: [], omiss: 0, commiss: 0, correctRej: 0, nGo: 0, nNoGo: 0 };
    for (let i = 0; i < seq.length; i++) {
      const isGo = seq[i];
      const r = await trial(isGo, isPractice, i);
      if (isGo) {
        stats.nGo++;
        if (r.responded) stats.goRts.push(r.rt);
        else stats.omiss++;
      } else {
        stats.nNoGo++;
        if (r.responded) stats.commiss++;
        else stats.correctRej++;
      }
      if (isPractice) {
        msg.textContent = !isGo && r.responded ? "❌ 不该点！" : isGo && !r.responded ? "⭕ 漏掉了" : "✅";
      }
    }
    return stats;
  }

  totalEl.textContent = "12";
  await new Promise((res) => stage.addEventListener("pointerdown", res, { once: true }));
  msg.textContent = "练习开始";
  await runBlock(shuffle([...Array(9).fill(true), ...Array(3).fill(false)]), true);

  msg.textContent = "正式开始（100 个），点击继续";
  totalEl.textContent = "100";
  nEl.textContent = "0";
  await new Promise((res) => stage.addEventListener("pointerdown", res, { once: true }));
  msg.textContent = "";   // 清除"点击继续"提示，正式测试期间不遮挡
  const s = await runBlock(shuffle([...Array(80).fill(true), ...Array(20).fill(false)]), false);
  document.removeEventListener("keydown", keyHandler);

  const hitRate = s.nGo ? s.goRts.length / s.nGo : null;
  return {
    task_id: "gonogo",
    n: s.nGo + s.nNoGo,
    n_go: s.nGo,
    n_nogo: s.nNoGo,
    go_median_rt: median(s.goRts),
    go_sd_rt: sd(s.goRts),
    cv_go: cv(s.goRts),
    omission_rate: s.nGo ? +(s.omiss / s.nGo).toFixed(3) : null,
    commission_rate: s.nNoGo ? +(s.commiss / s.nNoGo).toFixed(3) : null,
    hit_rate: hitRate === null ? null : +hitRate.toFixed(3),
    dprime: dprime(s.goRts.length, s.nGo, s.commiss, s.nNoGo),
  };
}
