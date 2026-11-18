/* ⑧ N-back（2-back）：方块位置序列，与前第 2 个位置相同按「匹配」。试次由版本配置决定。 */
import { el, dprime, onCleanup } from "../helpers.js";

const N = 2, STIM_MS = 2200, LIT_MS = 900, POS = 9;

export async function run(box, ctx) {
  const P = ctx.cfg || {};
  const N_PRACTICE = P.practice ?? 12;
  const N_FORMAL = P.formal ?? 42;
  const MATCH_RATE = P.matchRate ?? 0.3;
  box.innerHTML = `
    <p class="task-instruction">方块每 ${STIM_MS / 1000} 秒亮一次。若当前<b>亮起的位置</b>与<b>前面第 ${N} 个</b>位置相同，
    在亮起后尽快点「匹配」（或按空格）；不同则什么都不按。练习 ${N_PRACTICE} 个，正式 ${N_FORMAL} 个。</p>
    <div class="nb-grid" id="nb-grid"></div>
    <div class="nb-actions">
      <button class="btn" id="nb-match" hidden>匹配（空格）</button>
      <span class="hud" style="align-self:center"><span class="dim">进度 <b id="nb-n">0</b> / <b id="nb-total">0</b></span></span>
    </div>
    <div class="center-actions" style="margin-top:10px"><button class="btn primary" id="nb-start">▶ 开始</button></div>
    <p class="task-status" id="nb-status">未开始</p>
  `;
  const grid = box.querySelector("#nb-grid");
  const matchBtn = box.querySelector("#nb-match");
  const startBtn = box.querySelector("#nb-start");
  const nEl = box.querySelector("#nb-n");
  const totalEl = box.querySelector("#nb-total");
  const statusEl = box.querySelector("#nb-status");
  for (let i = 0; i < POS; i++) grid.appendChild(el(`<div class="nb-cell" data-i="${i}"></div>`));
  const cells = [...grid.children];

  /* 生成固定匹配率的序列 */
  function genSeq(len, matchRate) {
    const seq = [];
    for (let i = 0; i < len; i++) {
      if (i >= N && Math.random() < matchRate) seq.push(seq[i - N]);
      else {
        let p;
        do { p = Math.floor(Math.random() * POS); }
        while (i >= N && p === seq[i - N]);
        seq.push(p);
      }
    }
    return seq;
  }

  let responded = false;

  let liveKeyHandler = null;
  onCleanup(() => { if (liveKeyHandler) document.removeEventListener("keydown", liveKeyHandler); });

  /* 用户离开后立即停下：令牌作废 + 清定时器 + 让挂起的 await 立刻收尾 */
  const aborted = () => !!(ctx.ctl && ctx.ctl.aborted);
  const timers = new Set();
  const abortHandlers = new Set();
  const setT = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const onAbort = (fn) => { abortHandlers.add(fn); };
  const wait = (ms) => new Promise((r) => { setT(r, ms); onAbort(r); });
  onCleanup(() => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    abortHandlers.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    abortHandlers.clear();
  });

  function playSeq(seq, isPractice) {
    return new Promise(async (resolve) => {
      nEl.textContent = "0";   // 每阶段进度独立重置
      const stats = { hits: 0, misses: 0, fas: 0, corrRej: 0, nTargets: 0, nNonTargets: 0, seq };
      for (let i = 0; i < seq.length; i++) {
        if (aborted()) break;                  // 已离开：不再生成试次
        const pos = seq[i];
        const isTarget = i >= N && pos === seq[i - N];
        responded = false;
        // 亮起
        cells[pos].classList.add("lit");
        const litAt = performance.now();
        const onMatch = () => {
          if (responded) return;
          responded = true;
          const rt = Math.round(performance.now() - litAt);
          if (isTarget) stats.hits++;
          else stats.fas++;
          if (!isPractice && !aborted()) {
            ctx.logTrial("nback", {
              condition: isTarget ? "target" : "non_target",
              stimulus: `pos_${pos}`,
              response: "match",
              correct: isTarget,
              rt_ms: rt,
            });
          }
        };
        const btnHandler = () => onMatch();
        const keyHandler = (e) => { if (e.code === "Space") { e.preventDefault(); onMatch(); } };
        matchBtn.addEventListener("click", btnHandler, { once: true });
        liveKeyHandler = keyHandler;
        document.addEventListener("keydown", keyHandler, { once: true });
        await wait(LIT_MS);
        cells[pos].classList.remove("lit");
        // 剩余响应窗口
        await wait(STIM_MS - LIT_MS);
        matchBtn.removeEventListener("click", btnHandler);
        document.removeEventListener("keydown", keyHandler);
        if (!responded) {
          if (isTarget) stats.misses++;
          else stats.corrRej++;
          if (!isPractice && !aborted()) {
            ctx.logTrial("nback", {
              condition: isTarget ? "target" : "non_target",
              stimulus: `pos_${pos}`,
              response: "no_response",
              correct: !isTarget,
              rt_ms: null,
            });
          }
        }
        /* 练习与正式都更新进度 */
        nEl.textContent = String(i + 1);
      }
      resolve(stats);
    });
  }

  totalEl.textContent = String(N_PRACTICE);
  /* 准备页：先点"开始"，之后才显示"匹配（空格）"进入试次 */
  await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
  startBtn.style.display = "none";     // 点击后隐藏，防止重复点击
  statusEl.textContent = "已开始";
  matchBtn.hidden = false;
  await playSeq(genSeq(N_PRACTICE, MATCH_RATE), true);
  if (aborted()) return null;          // 用户已离开：不进入正式段

  totalEl.textContent = String(N_FORMAL);
  nEl.textContent = "0";
  statusEl.textContent = "练习结束，准备进入正式测试";
  startBtn.textContent = "▶ 开始正式测试";
  startBtn.style.display = "";         // 正式测试另起一个明确的开始入口
  await new Promise((res) => startBtn.addEventListener("click", res, { once: true }));
  startBtn.style.display = "none";
  statusEl.textContent = "已开始（正式）";
  const s = await playSeq(genSeq(N_FORMAL, MATCH_RATE), false);
  if (aborted()) return null;          // 已离开：不结算、不写盘
  statusEl.textContent = "✅ 已完成";
  statusEl.classList.add("done");

  return {
    task_id: "nback",
    n: s.seq.length,
    n_targets: s.nTargets || s.hits + s.misses,
    hit_rate: (s.hits + s.misses) ? +(s.hits / (s.hits + s.misses)).toFixed(3) : null,
    fa_rate: (s.fas + s.corrRej) ? +(s.fas / (s.fas + s.corrRej)).toFixed(3) : null,
    accuracy: +((s.hits + s.corrRej) / s.seq.length).toFixed(3),
    dprime: dprime(s.hits, s.hits + s.misses, s.fas, s.fas + s.corrRej),
  };
}
