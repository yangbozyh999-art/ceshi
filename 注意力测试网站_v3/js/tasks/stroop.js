/* ⑤ Stroop 色词干扰：判断文字的显示颜色。练习/正式试次由版本配置决定（正式试次一致/不一致各半，随机）。 */
import { el, median, shuffle, onCleanup } from "../helpers.js";

const COLORS = [
  { name: "红", hex: "#dc2626" },
  { name: "绿", hex: "#16a34a" },
  { name: "蓝", hex: "#2563eb" },
  { name: "黄", hex: "#d97706" },
];

export async function run(box, ctx) {
  const P = ctx.cfg || {};
  const N_PRACTICE = P.practice ?? 8;
  const N_FORMAL = P.formal ?? 60;
  box.innerHTML = `
    <p class="task-instruction">忽略文字含义，<b>只选文字的显示颜色</b>。点击按钮或按键盘 1-4。
    练习 ${N_PRACTICE} 个（不计分），正式 ${N_FORMAL} 个。</p>
    <div class="hud" style="margin-bottom:10px">
      <span class="dim">进度 <b id="st-n">0</b> / <b id="st-total">0</b></span>
      <span class="dim">正确 <b id="st-ok">0</b></span>
    </div>
    <div class="stage" style="min-height:170px"><div class="big-stim" id="st-word" style="font-size:56px">？</div></div>
    <div class="ans-btns" style="margin-top:12px" id="st-ans"></div>
    <div class="center-actions"><button class="btn primary" id="st-start">▶ 开始</button></div>
    <p class="task-status" id="st-status">未开始</p>
  `;
  const wordEl = box.querySelector("#st-word");
  const ansEl = box.querySelector("#st-ans");
  const nEl = box.querySelector("#st-n");
  const okEl = box.querySelector("#st-ok");
  const totalEl = box.querySelector("#st-total");
  const startBtn = box.querySelector("#st-start");
  const statusEl = box.querySelector("#st-status");

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
  onCleanup(() => document.removeEventListener("keydown", keyHandler));

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

  /* 正式试次：一致/不一致各半，随机 */
  const HALF = Math.floor(N_FORMAL / 2);
  const formal = shuffle([
    ...Array(HALF).fill("congruent"),
    ...Array(N_FORMAL - HALF).fill("incongruent"),
  ]);

  /* 干扰量只用正确试次计算：错误试次往往伴随迟疑，混入中位数会同时抬高两侧、甚至
   * 相互抵消出 0 或负值。某条件正确试次不足时输出 null，由结果页提示「数据不足」。
   * 样本阈值按版本：快速版试次少（每条件约 8 条），阈值放宽到 3；其余版本 5。 */
  const MIN_CORRECT_BY_VERSION = { quick: 3, standard: 5, full: 5 };
  const MIN_CORRECT = MIN_CORRECT_BY_VERSION[ctx.version] ?? 5;

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
        if (r.correct) { rts[r.condition].push(r.rt); ok++; }   // 错误试次只计入正确率
        okEl.textContent = String(ok);
      }
    }
    return { rts, ok };
  }

  // 准备页：先点"开始"，之后才进入试次（此前按钮禁用输入，避免误触出数据）
  await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
  startBtn.style.display = "none";     // 点击后隐藏，防止重复点击
  statusEl.textContent = "已开始";

  // 练习
  const practiceConds = Array.from({ length: N_PRACTICE }, () => Math.random() < 0.5 ? "congruent" : "incongruent");
  await block(N_PRACTICE, true, practiceConds);
  wordEl.textContent = "？"; wordEl.style.color = "var(--text)";
  totalEl.textContent = String(N_FORMAL);
  // 正式
  const res = await block(N_FORMAL, false, formal);
  statusEl.textContent = "✅ 已完成";
  statusEl.classList.add("done");
  document.removeEventListener("keydown", keyHandler);

  const { rts, ok } = res;
  const cm = rts.congruent.length >= MIN_CORRECT ? median(rts.congruent) : null;
  const im = rts.incongruent.length >= MIN_CORRECT ? median(rts.incongruent) : null;
  return {
    task_id: "stroop",
    n: N_FORMAL,
    accuracy: +(ok / N_FORMAL).toFixed(3),
    n_correct: { congruent: rts.congruent.length, incongruent: rts.incongruent.length },
    min_n: MIN_CORRECT,
    congruent_median: cm,
    incongruent_median: im,
    stroop_effect: cm !== null && im !== null ? im - cm : null,
  };
}
