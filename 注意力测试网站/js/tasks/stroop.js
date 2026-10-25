/* ⑤ Stroop 色词干扰：判断文字的显示颜色。练习 8 个不计分，正式 60 个（一致/不一致各半，随机）。 */
import { el, median, shuffle } from "../helpers.js";

const COLORS = [
  { name: "红", hex: "#dc2626" },
  { name: "绿", hex: "#16a34a" },
  { name: "蓝", hex: "#2563eb" },
  { name: "黄", hex: "#d97706" },
];

export async function run(box, ctx) {
  box.innerHTML = `
    <p class="task-instruction">忽略文字含义，<b>只选文字的显示颜色</b>。点击按钮或按键盘 1-4。
    练习 8 个（不计分），正式 60 个。</p>
    <div class="hud" style="margin-bottom:10px">
      <span class="dim">进度 <b id="st-n">0</b> / <b id="st-total">0</b></span>
      <span class="dim">正确 <b id="st-ok">0</b></span>
    </div>
    <div class="stage" style="min-height:170px"><div class="big-stim" id="st-word" style="font-size:56px">？</div></div>
    <div class="ans-btns" style="margin-top:12px" id="st-ans"></div>
  `;
  const wordEl = box.querySelector("#st-word");
  const ansEl = box.querySelector("#st-ans");
  const nEl = box.querySelector("#st-n");
  const okEl = box.querySelector("#st-ok");
  const totalEl = box.querySelector("#st-total");

  COLORS.forEach((c, i) => {
    const b = el(`<button class="ans-btn">${c.name}<br><span style="font-size:11px;color:var(--text-dim)">键 ${i + 1}</span></button>`);
    b.addEventListener("click", () => respond(i));
    ansEl.appendChild(b);
  });

  let resolveTrial = null, acceptInput = false;
  function respond(i) {
    if (!acceptInput) return;
    acceptInput = false;
    resolveTrial(i);
  }
  const keyHandler = (e) => {
    const k = +e.key;
    if (k >= 1 && k <= 4) respond(k - 1);
  };
  document.addEventListener("keydown", keyHandler);

  function showTrial(wordIdx, inkIdx, isPractice, trialIdx) {
    return new Promise((resolve) => {
      wordEl.textContent = COLORS[wordIdx].name;
      wordEl.style.color = COLORS[inkIdx].hex;
      const t0 = performance.now();
      acceptInput = true;
      resolveTrial = (choice) => {
        const rt = Math.round(performance.now() - t0);
        const correct = choice === inkIdx;
        if (!isPractice) {
          ctx.logTrial("stroop", {
            condition: wordIdx === inkIdx ? "congruent" : "incongruent",
            stimulus: `${COLORS[wordIdx].name}/${COLORS[inkIdx].name}`,
            response: COLORS[choice].name,
            correct, rt_ms: rt,
          });
        }
        resolve({ correct, rt, condition: wordIdx === inkIdx ? "congruent" : "incongruent" });
      };
    });
  }

  /* 正式试次：30 一致 + 30 不一致，随机 */
  const formal = shuffle([
    ...Array(30).fill("congruent"),
    ...Array(30).fill("incongruent"),
  ]);

  async function block(count, isPractice, conditions) {
    const rts = { congruent: [], incongruent: [] };
    let ok = 0;
    totalEl.textContent = String(count);
    nEl.textContent = "0";   // 每个阶段开始时进度独立重置
    okEl.textContent = "0";
    for (let i = 0; i < count; i++) {
      const condition = conditions[i];
      const wordIdx = Math.floor(Math.random() * 4);
      const inkIdx = condition === "congruent"
        ? wordIdx
        : (wordIdx + 1 + Math.floor(Math.random() * 3)) % 4;
      const r = await showTrial(wordIdx, inkIdx, isPractice, i);
      /* 练习与正式都更新进度 */
      nEl.textContent = String(i + 1);
      if (!isPractice) {
        rts[r.condition].push(r.rt);
        if (r.correct) ok++;
        okEl.textContent = String(ok);
      }
    }
    return { rts, ok };
  }

  // 练习
  await block(8, true, Array(8).fill("practice").map(() => Math.random() < 0.5 ? "congruent" : "incongruent"));
  wordEl.textContent = "？"; wordEl.style.color = "var(--text)";
  totalEl.textContent = "60";
  // 正式
  const res = await block(60, false, formal);
  document.removeEventListener("keydown", keyHandler);

  const { rts, ok } = res;
  const cm = median(rts.congruent), im = median(rts.incongruent);
  return {
    task_id: "stroop",
    n: 60,
    accuracy: +(ok / 60).toFixed(3),
    congruent_median: cm,
    incongruent_median: im,
    stroop_effect: cm !== null && im !== null ? im - cm : null,
  };
}
