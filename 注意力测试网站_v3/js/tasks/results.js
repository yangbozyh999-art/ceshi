/* ⑪ 结果汇总：版本标注 + 客观维度分 + 任务指标 + 分享卡片 + AI 解释 + 导出 */
import { el } from "../helpers.js";
import { uiConfirm, uiPrompt, uiToast } from "../ui.js";
import { computeDims, buildAiPayload } from "../scoring.js";
import { generateReport } from "../ai.js";

export async function run(box, ctx) {
  const state = window.__getSession();
  state.finished_at = state.finished_at || new Date().toISOString();
  const started = new Date(state.started_at || Date.now()).getTime();
  const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
  state.duration_min = mins;
  try { localStorage.setItem("atc-session", JSON.stringify(state)); } catch (e) { /* 隐私模式下忽略 */ }

  const { dims, reliability } = computeDims(state);
  const ver = getVersion(state.version);
  const isQuick = state.version === "quick";
  const plannedTasks = versionTaskList(state.version);   // 本版本应完成的任务（含被跳过项）
  const doneTasks = plannedTasks.filter((id) => state.metrics[id] && !state.metrics[id].skipped);
  const skippedTasks = plannedTasks.filter((id) => state.metrics[id] && state.metrics[id].skipped);
  const countNote = skippedTasks.length
    ? `完成 ${doneTasks.length} 项任务（${plannedTasks.length} 项中 ${skippedTasks.length} 项跳过）`
    : `完成 ${doneTasks.length} 项任务`;
  const relNote = isQuick ? "快速版：样本较少，仅供参考" : `${ver.name}：${ver.reliabilityShort}`;

  box.innerHTML = `
    <!-- 版本横幅 -->
    <div class="ver-banner">
      <span class="vb-name">${ver.name}</span>
      <span class="vb-meta">实际用时约 ${mins} 分钟 · ${countNote}</span>
      <span class="vb-rel">可靠性：${ver.reliability}</span>
    </div>
    <p class="hint" style="text-align:center">参与者 ${state.participant_id} · 会话 ${state.session_id} · 完成于 ${new Date().toLocaleString()}</p>
    <p class="hint" style="text-align:center">完成的任务：${doneTasks.map((t) => TASK_TITLES[t]).join(" · ") || "—"}${skippedTasks.length ? `（跳过：${skippedTasks.map((t) => TASK_TITLES[t]).join("、")}）` : ""}</p>

    <!-- 分享（显著但不遮挡结果） -->
    <div class="share-bar">
      <button class="btn primary" id="sh-card">📤 生成分享卡片</button>
      <button class="btn" id="sh-copy">📋 复制分享文案</button>
      <button class="btn" id="sh-challenge">🔥 挑战好友</button>
      <button class="btn" id="again-btn">🔄 再次测试</button>
    </div>
    <p class="hint" id="sh-tip" hidden style="color:#16a34a">✅ 已复制</p>

    <h3 style="margin:16px 0 4px">六维度客观分（0-100，规则层计算）</h3>
    <p class="hint">${relNote}。不同版本的分数<b>不能直接横向比较</b>（试次越多越稳定，但并非线性提升）。</p>
    <div class="dim-grid" id="dim-grid"></div>
    <div class="center-actions" style="margin-top:8px">
      ${state.version !== "standard" ? `<a class="btn" href="#/test/new?ver=standard">去做标准版（${getVersion("standard").timeLabel}）</a>` : ""}
      ${state.version !== "full" ? `<a class="btn" href="#/test/new?ver=full">去做完整版（${getVersion("full").timeLabel}）</a>` : ""}
    </div>

    <h3 style="margin:16px 0 4px">各任务指标</h3>
    <div class="table-wrap"><table class="metrics" id="metrics-table"></table></div>
    ${isQuick ? '<p class="hint">⚠️ 快速版试次较少，效应量（干扰量、d′）仅供参考；某条件正确试次不足时会标注「数据不足」。</p>' : ""}

    <h3 style="margin:16px 0 4px">AI 综合解释</h3>
    <div class="ai-box">
      <p class="hint" style="margin-bottom:8px">
        <b>推荐方式（无需任何配置）：</b>点击下方按钮复制测试报告和提示词，粘贴到任意 AI 网站（如 DeepSeek、Kimi）即可获得解读。
        <b>本网站不会自动上传你的数据</b>，是否粘贴给 AI 由你自行决定。
      </p>
      <div class="export-row" style="margin-bottom:10px">
        <button class="btn" id="copy-report">📋 复制测试报告</button>
        <button class="btn" id="copy-prompt">📋 复制 AI 提示词模板</button>
      </div>
      <div class="export-row" id="ai-links-row" style="margin-bottom:10px"></div>
      <p class="hint" id="copy-ok" hidden style="color:#16a34a">✅ 已复制到剪贴板</p>

      <details style="margin-top:12px">
        <summary style="cursor:pointer" class="hint">⚙️ 高级：自动调用 AI（API / 后端代理，可选）</summary>
        <div style="margin-top:8px">
          <div class="hint" style="margin-bottom:8px">AI 只读取结构化指标与客观分，生成解释与建议；<b>不会修改客观分，也不构成医学诊断</b>。
          未配置时请前往 <a href="#/settings">⚙️ 设置</a>。</div>
          <div class="ai-body" id="ai-body">尚未生成。</div>
          <div class="center-actions"><button class="btn primary" id="ai-go">调用 AI 生成解释</button></div>
        </div>
      </details>
    </div>

    <h3 style="margin:16px 0 4px">导出数据</h3>
    <div class="export-row">
      <button class="btn" id="exp-json">导出 JSON（含 trial 级原始数据）</button>
      <button class="btn" id="exp-csv">导出 CSV（trial 级原始数据）</button>
    </div>
    <p class="hint" style="margin-top:10px">⚕️ 本报告为自测/娱乐/研究用途，<b>不构成医学诊断</b>；如有困扰请咨询专业机构。</p>
  `;

  /* 维度分（带版本可靠性提示） */
  const dimGrid = box.querySelector("#dim-grid");
  for (const [name, d] of Object.entries(dims)) {
    dimGrid.appendChild(el(`<div class="dim-item">
      <div class="dhead"><span>${name}</span><span class="lvl-${d.level === "优秀" ? "高" : d.level === "待提升" ? "低" : "中"}">${d.score === null ? "—" : d.score + " · " + d.level}</span></div>
      <div class="dbar"><i style="width:${d.score ?? 0}%"></i></div>
      <div class="dnote">${d.score === null ? "该维度数据缺失" : relNote}</div>
    </div>`));
  }

  /* 指标表 */
  const TASK_NAMES = {
    srt: "简单反应时", schulte: "舒尔特方格", stroop: "Stroop", cancel: "数字划消",
    gonogo: "Go/No-Go", nback: "2-back", digitspan: "数字广度",
  };
  const FMT = {
    srt: (m) => `中位 ${m.median_rt}ms · SD ${m.sd_rt}ms · CV ${m.cv}`,
    schulte: (m) => `${m.grid || "5x5"} 中位 ${m.median_time_s}s · ${m.boards} 盘 · 总错误 ${m.total_errors}`,
    stroop: (m) => {
      /* 干扰量只用正确试次计算，样本不足时为 null → 明确提示，不显示 nullms / NaN */
      const accPct = Number.isFinite(m.accuracy) ? Math.round(m.accuracy * 100) : 0;
      const acc = `正确率 ${accPct}%`;
      const need = m.min_n || 5;
      const nc = m.n_correct || { congruent: 0, incongruent: 0 };
      const ms = (v) => (Number.isFinite(v) ? Math.round(v) : "—");
      if (!Number.isFinite(m.stroop_effect)) {
        return `${acc} · 干扰量：数据不足（正确试次 一致 ${nc.congruent} 条 / 不一致 ${nc.incongruent} 条，需各 ≥ ${need} 条）`;
      }
      const tail = isQuick ? "（快速版样本较少，仅供参考）" : "";
      return `${acc} · 一致 ${ms(m.congruent_median)}ms · 不一致 ${ms(m.incongruent_median)}ms · 干扰量 ${Math.round(m.stroop_effect)}ms${tail}`;
    },
    cancel: (m) => `命中 ${m.hits}/${m.target_count || 16} · 漏划 ${m.missed} · 误划 ${m.false_hits} · 速度 ${m.speed}/min`,
    gonogo: (m) => isQuick
      ? `Go 中位 ${m.go_median_rt}ms · 漏报率 ${(m.omission_rate * 100).toFixed(0)}% · 虚报率 ${(m.commission_rate * 100).toFixed(0)}%（试次少，不输出 d′）`
      : `Go 中位 ${m.go_median_rt}ms · 漏报率 ${(m.omission_rate * 100).toFixed(0)}% · 虚报率 ${(m.commission_rate * 100).toFixed(0)}% · d′ ${m.dprime}`,
    nback: (m) => isQuick
      ? `命中率 ${(m.hit_rate * 100).toFixed(0)}% · 虚报率 ${(m.fa_rate * 100).toFixed(0)}%（试次少，不输出 d′）`
      : `命中率 ${(m.hit_rate * 100).toFixed(0)}% · 虚报率 ${(m.fa_rate * 100).toFixed(0)}% · d′ ${m.dprime} · 总正确率 ${(m.accuracy * 100).toFixed(0)}%`,
    digitspan: (m) => `最大广度 ${m.max_span} 位`,
  };
  const table = box.querySelector("#metrics-table");
  for (const id of plannedTasks.concat(["digitspan"]).filter((v, i, a) => a.indexOf(v) === i)) {
    if (!TASK_NAMES[id]) continue;
    const m = state.metrics[id];
    const cell = m
      ? m.skipped ? '<span style="color:#b45309">⏭ 该任务已跳过，未计分</span>' : FMT[id](m)
      : '<span class="hint">未完成</span>';
    table.appendChild(el(`<tr><td>${TASK_NAMES[id]}</td><td>${cell}</td></tr>`));
  }

  /* 再次测试 */
  const againBtn = box.querySelector("#again-btn");
  againBtn.addEventListener("click", async () => {
    const ok = await uiConfirm({
      title: "再次测试",
      message: "将清空当前测试结果，回到版本选择页重新开始，确定吗？",
      okText: "确定重新开始",
      danger: true,
    });
    if (!ok) return;
    againBtn.disabled = true;
    window.__restartTest();
  });

  /* ---------- 分享 ---------- */
  const tip = box.querySelector("#sh-tip");
  let tipTimer = null;
  const showTip = (t) => {
    tip.textContent = t || "✅ 已复制";
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.hidden = true; }, 2200);
  };
  box.querySelector("#sh-card").addEventListener("click", () => {
    try { openShareCard(state, dims); } catch (e) { console.error(e); uiToast("卡片生成失败，但不影响查看结果", "err"); }
  });
  box.querySelector("#sh-copy").addEventListener("click", async () => {
    const txt = await uiPrompt({
      title: "分享文案",
      message: "文案可直接编辑，确认后复制：",
      value: buildShareText(state, dims),
      okText: "复制",
      rows: 6,
    });
    if (txt === null) return;
    const ok = await copyText(txt);
    if (ok) showTip(); else uiToast("复制失败，请手动选中复制", "err");
  });
  box.querySelector("#sh-challenge").addEventListener("click", async () => {
    const link = encodeChallenge(state, dims);
    const ok = await copyText(link);
    if (ok) showTip("✅ 挑战链接已复制，发给好友即可");
    else {
      const manual = await uiPrompt({ title: "挑战链接", message: "自动复制失败，请手动复制下面的链接：", value: link, okText: "复制", rows: 3 });
      if (manual !== null) copyText(manual);
    }
  });

  /* 好友挑战对比（只对比两次个人表现，无排名/常模） */
  try {
    const pend = JSON.parse((function () { try { return localStorage.getItem("atc-challenge"); } catch (e) { return null; } })() || "null");
    if (pend && pend.d && pend.v === state.version) {
      const mine = {};
      for (const [k, s] of topDims(dims, 3)) mine[k] = s;
      const rows = pend.d.map(([k, s]) => `<tr><td>${k}</td><td>${s}</td><td>${mine[k] ?? "—"}</td></tr>`).join("");
      box.insertBefore(el(`<div class="panel" style="margin-top:14px">
        <h3 style="margin:0 0 6px">🔥 与好友的对比（同版本）</h3>
        <div class="table-wrap"><table class="metrics"><tr><th>维度</th><th>好友</th><th>你</th></tr>${rows}</table></div>
        <p class="hint" style="margin-top:8px">这里只对比你们两次的个人成绩，<b>不代表人群排名或常模</b>。</p>
      </div>`), box.querySelector("#dim-grid").parentNode.nextSibling);
      try { localStorage.removeItem("atc-challenge"); } catch (e) {}
    }
  } catch (e) {}

  /* ---------- AI：复制报告 / 提示词 / 链接 ---------- */
  function buildReportText() {
    const lines = [];
    lines.push("【注意力与记忆力测试报告】");
    lines.push(`版本：${ver.name}（可靠性：${ver.reliability}）· 实际用时约 ${mins} 分钟`);
    lines.push(`参与者 ${state.participant_id} · 会话 ${state.session_id} · 完成于 ${new Date(state.finished_at || Date.now()).toLocaleString()}`);
    lines.push("");
    lines.push("一、六维度客观分（0-100，由网站规则计算）：");
    for (const [name, d] of Object.entries(dims)) {
      lines.push(`- ${name}：${d.score === null ? "数据缺失" : d.score + "（" + d.level + "）"}`);
    }
    lines.push("");
    lines.push("二、任务完成情况：");
    for (const id of plannedTasks) {
      const m = state.metrics[id];
      lines.push(`- ${TASK_TITLES[id]}：${!m ? "未完成" : m.skipped ? "已跳过（未计分）" : FMT[id](m)}`);
    }
    const p = state.info || {};
    lines.push("");
    lines.push(`三、背景信息：年龄 ${p.age ?? "未填"} · 睡眠 ${p.sleep_hours ?? "未填"} 小时 · 咖啡因 ${p.caffeine ?? "未填"} · 疲劳度 ${p.fatigue ?? "未填"}/7`);
    lines.push("");
    lines.push(`四、口径说明：${VERSION_NOTE}`);
    lines.push("⚕️ 声明：本测试为自测/娱乐/研究用途，不构成医学诊断。如有困扰请咨询专业医疗机构。");
    return lines.join("\n");
  }
  function buildPromptText() {
    return [
      "你是一名认知测评解读助手。请基于下面这份「注意力与记忆力测试报告」，用通俗语言完成：",
      "1. 总评：2-3 句概括整体表现；",
      "2. 维度解读：逐条解释每个维度分数的含义与可能影响因素；",
      "3. 建议：给出 3-5 条可操作的日常改善建议；",
      "4. 置信度说明：结合版本可靠性（本次为「" + ver.name + "」）指出结论的可信程度与局限。",
      "",
      "硬性要求：不得做出任何医学诊断或建议用药；不得修改或重算客观分数；不得跨版本横向比较分数；语气客观中立。",
      "",
      buildReportText(),
    ].join("\n");
  }
  const copyOk = box.querySelector("#copy-ok");
  let copyTimer = null;
  function showCopyOk() {
    copyOk.hidden = false;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyOk.hidden = true; }, 2000);
  }
  box.querySelector("#copy-report").addEventListener("click", async () => {
    if (await copyText(buildReportText())) showCopyOk();
    else uiToast("复制失败，请手动选中复制", "err");
  });
  box.querySelector("#copy-prompt").addEventListener("click", async () => {
    if (await copyText(buildPromptText())) showCopyOk();
    else uiToast("复制失败，请手动选中复制", "err");
  });

  /* 常用 AI 链接：顺序与 URL 集中在 js/ai-links-config.js */
  const linksRow = box.querySelector("#ai-links-row");
  for (const l of (window.AI_LINKS || [])) {
    if (l.url) linksRow.appendChild(el(`<a class="btn" href="${l.url}" target="_blank" rel="noopener">${l.name}</a>`));
    else linksRow.appendChild(el(`<span class="btn" style="opacity:.5;cursor:not-allowed" title="官方网址待确认">${l.name}（待确认）</span>`));
  }

  /* AI 自动调用（失败降级） */
  const aiBody = box.querySelector("#ai-body");
  const aiBtn = box.querySelector("#ai-go");
  aiBtn.addEventListener("click", async () => {
    aiBtn.disabled = true;
    aiBody.innerHTML = '<span class="hint">AI 生成中…（最长可能需要 1 分钟）</span>';
    try {
      const payload = buildAiPayload(state, dims);
      payload.reliability = reliability;
      const report = await generateReport(payload);
      let html = `<b>总评：</b>${escapeHtml(report.overall || "--")}\n\n`;
      html += "<b>维度解读：</b>\n" + Object.entries(report.dimensions || {}).map(([k, v]) => `· ${k}：${v}`).join("\n") + "\n\n";
      html += "<b>建议：</b>\n" + (report.suggestions || []).map((s) => `· ${s}`).join("\n");
      html += `\n\n<span class="hint">置信度说明：${escapeHtml(report.confidence_note || "--")}</span>`;
      aiBody.innerHTML = html.replace(/\n/g, "<br>");
      aiBtn.textContent = "重新生成";
    } catch (e) {
      const noKey = String(e.message || e).includes("NO_KEY");
      aiBody.innerHTML = `<span class="ai-err">⚠️ AI 解释暂不可用${noKey ? "（未配置 AI，请前往 ⚙️ 设置；或使用上面的复制方式）" : "（" + escapeHtml(String(e.message || e)) + "）"}。</span><br>
        <span class="hint">以下客观评分与导出数据不受影响。</span>`;
      aiBtn.textContent = "重试";
    }
    aiBtn.disabled = false;
  });

  box.querySelector("#exp-json").addEventListener("click", () => window.__exportSession("json"));
  box.querySelector("#exp-csv").addEventListener("click", () => window.__exportSession("csv"));

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) {}
      ta.remove();
      return ok;
    }
  }
}
