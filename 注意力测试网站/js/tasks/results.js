/* ⑪ 结果汇总：客观维度分 + 任务指标表 + AI 解释（失败降级）+ JSON/CSV 导出 */
import { el } from "../helpers.js";
import { computeDims, buildAiPayload } from "../scoring.js";
import { generateReport } from "../ai.js";

export async function run(box, ctx) {
  const state = window.__getSession();
  state.finished_at = new Date().toISOString();
  localStorage.setItem("atc-session", JSON.stringify(state));

  const { dims } = computeDims(state);
  const info = state.info;

  box.innerHTML = `
    <div class="task-title">测试完成 ✅</div>
    <p class="hint">参与者 ${state.participant_id} · 会话 ${state.session_id} · 完成于 ${new Date().toLocaleString()}</p>
    <div class="center-actions" style="margin:10px 0">
      <button class="btn" id="again-btn">🔄 再次测试</button>
    </div>

    <h3 style="margin:16px 0 4px">六维度客观分（0-100，规则层计算）</h3>
    <div class="dim-grid" id="dim-grid"></div>

    <h3 style="margin:16px 0 4px">各任务指标</h3>
    <table class="metrics" id="metrics-table"></table>

    <h3 style="margin:16px 0 4px">AI 综合解释</h3>
    <div class="ai-box">
      <p class="hint" style="margin-bottom:8px">
        <b>推荐方式（无需任何配置）：</b>点击下方按钮复制测试报告和提示词，粘贴到任意 AI 网站（如 ChatGPT、Kimi、DeepSeek）即可获得解读。
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
          <div class="hint" style="margin-bottom:8px">AI 只读取上方的结构化指标与客观分，生成解释与建议；<b>不会修改客观分，也不构成医学诊断</b>。
          未配置时请前往 <a href="#/settings">⚙️ 设置</a>。返回后点击下方按钮。</div>
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

  /* 维度分渲染 */
  const dimGrid = box.querySelector("#dim-grid");
  for (const [name, d] of Object.entries(dims)) {
    dimGrid.appendChild(el(`<div class="dim-item">
      <div class="dhead"><span>${name}</span><span class="lvl-${d.level === "优秀" ? "高" : d.level === "待提升" ? "低" : "中"}">${d.score === null ? "—" : d.score + " · " + d.level}</span></div>
      <div class="dbar"><i style="width:${d.score ?? 0}%"></i></div>
      <div class="dnote">${d.score === null ? "该维度数据缺失" : ""}</div>
    </div>`));
  }

  /* 指标表渲染 */
  const TASK_NAMES = {
    srt: "简单反应时", schulte: "舒尔特 5×5", stroop: "Stroop", cancel: "数字划消",
    gonogo: "Go/No-Go", nback: "2-back", digitspan: "数字广度",
  };
  const FMT = {
    srt: (m) => `中位 ${m.median_rt}ms · SD ${m.sd_rt}ms · CV ${m.cv}`,
    schulte: (m) => `中位 ${m.median_time_s}s · 总错误 ${m.total_errors}`,
    stroop: (m) => `正确率 ${(m.accuracy * 100).toFixed(0)}% · 一致 ${m.congruent_median}ms · 不一致 ${m.incongruent_median}ms · 干扰量 ${m.stroop_effect}ms`,
    cancel: (m) => `命中 ${m.hits}/16 · 漏划 ${m.missed} · 误划 ${m.false_hits} · 速度 ${m.speed}/min`,
    gonogo: (m) => `Go 中位 ${m.go_median_rt}ms · 漏报率 ${(m.omission_rate * 100).toFixed(0)}% · 虚报率 ${(m.commission_rate * 100).toFixed(0)}% · d' ${m.dprime}`,
    nback: (m) => `命中率 ${(m.hit_rate * 100).toFixed(0)}% · 虚报率 ${(m.fa_rate * 100).toFixed(0)}% · d' ${m.dprime} · 总正确率 ${(m.accuracy * 100).toFixed(0)}%`,
    digitspan: (m) => `最大广度 ${m.max_span} 位`,
  };
  const table = box.querySelector("#metrics-table");
  for (const [id, name] of Object.entries(TASK_NAMES)) {
    const m = state.metrics[id];
    const cell = m
      ? m.skipped ? '<span style="color:#b45309">⏭ 该任务已跳过（开发模式），未计分</span>' : FMT[id](m)
      : '<span class="hint">未完成</span>';
    const tr = el(`<tr><td>${name}</td><td>${cell}</td></tr>`);
    table.appendChild(tr);
  }

  /* 导出 */
  box.querySelector("#exp-json").addEventListener("click", () => window.__exportSession("json"));
  box.querySelector("#exp-csv").addEventListener("click", () => window.__exportSession("csv"));

  /* 再次测试：确认后清空任务数据与结果（保留基本信息），重新开始 */
  box.querySelector("#again-btn").addEventListener("click", () => {
    if (!confirm("将清空当前测试结果并重新开始测试，确定吗？（基本信息会保留）")) return;
    window.__restartTest();
  });

  /* ---------- 手动 AI 辅助解读：报告文本 + 提示词模板 ---------- */
  const TASK_NAMES_CN = {
    srt: "简单反应时", schulte: "舒尔特 5×5", stroop: "Stroop 色词干扰", cancel: "数字划消",
    gonogo: "Go/No-Go", nback: "2-back 工作记忆", digitspan: "数字广度",
  };
  function buildReportText() {
    const lines = [];
    lines.push("【注意力与记忆力测试报告】");
    lines.push(`参与者 ${state.participant_id} · 会话 ${state.session_id} · 完成于 ${new Date(state.finished_at || Date.now()).toLocaleString()}`);
    lines.push("");
    lines.push("一、六维度客观分（0-100，由网站规则计算）：");
    for (const [name, d] of Object.entries(dims)) {
      lines.push(`- ${name}：${d.score === null ? "数据缺失" : d.score + "（" + d.level + "）"}`);
    }
    lines.push("");
    lines.push("二、任务完成情况：");
    for (const [id, name] of Object.entries(TASK_NAMES)) {
      const m = state.metrics[id];
      if (!m) lines.push(`- ${name}：未完成`);
      else if (m.skipped) lines.push(`- ${name}：已跳过（未计分）`);
      else lines.push(`- ${name}：${FMT[id](m)}`);
    }
    const p = state.info || {};
    lines.push("");
    lines.push(`三、背景信息：年龄 ${p.age ?? "未填"} · 睡眠 ${p.sleep_hours ?? "未填"} 小时 · 咖啡因 ${p.caffeine ?? "未填"} · 疲劳度 ${p.fatigue ?? "未填"}/7`);
    lines.push("");
    lines.push("⚕️ 声明：本测试为自测/娱乐/研究用途，不构成医学诊断。如有困扰请咨询专业医疗机构。");
    return lines.join("\n");
  }
  function buildPromptText() {
    return [
      "你是一名认知测评解读助手。请基于下面这份「注意力与记忆力测试报告」，用通俗语言完成：",
      "1. 总评：2-3 句概括整体表现；",
      "2. 维度解读：逐条解释每个维度分数的含义与可能影响因素；",
      "3. 建议：给出 3-5 条可操作的日常改善建议；",
      "4. 置信度说明：指出哪些结果可能受设备、环境、状态（睡眠/咖啡因/疲劳）影响。",
      "",
      "硬性要求：不得做出任何医学诊断或建议用药；不得修改或重算客观分数；语气客观中立。",
      "",
      buildReportText(),
    ].join("\n");
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
  const copyOk = box.querySelector("#copy-ok");
  let copyTimer = null;
  function showCopyOk() {
    copyOk.hidden = false;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyOk.hidden = true; }, 2000);
  }
  box.querySelector("#copy-report").addEventListener("click", async () => {
    if (await copyText(buildReportText())) showCopyOk();
    else alert("复制失败，请手动选中复制。");
  });
  box.querySelector("#copy-prompt").addEventListener("click", async () => {
    if (await copyText(buildPromptText())) showCopyOk();
    else alert("复制失败，请手动选中复制。");
  });

  /* 常用 AI 网站链接：顺序与 URL 集中在 js/ai-links-config.js，新窗口打开 */
  const linksRow = box.querySelector("#ai-links-row");
  for (const l of (window.AI_LINKS || [])) {
    if (l.url) {
      linksRow.appendChild(el(`<a class="btn" href="${l.url}" target="_blank" rel="noopener">${l.name}</a>`));
    } else {
      linksRow.appendChild(el(`<span class="btn" style="opacity:.5;cursor:not-allowed" title="官方网址待确认">${l.name}（待确认）</span>`));
    }
  }

  /* AI 解释（失败降级） */
  const aiBody = box.querySelector("#ai-body");
  const aiBtn = box.querySelector("#ai-go");
  aiBtn.addEventListener("click", async () => {
    aiBtn.disabled = true;
    aiBody.innerHTML = '<span class="hint">AI 生成中…（最长可能需要 1 分钟）</span>';
    try {
      const report = await generateReport(buildAiPayload(state, dims));
      let html = `<b>总评：</b>${escapeHtml(report.overall || "--")}\n\n`;
      html += "<b>维度解读：</b>\n" + Object.entries(report.dimensions || {})
        .map(([k, v]) => `· ${k}：${v}`).join("\n") + "\n\n";
      html += "<b>建议：</b>\n" + (report.suggestions || []).map((s) => `· ${s}`).join("\n");
      html += `\n\n<span class="hint">置信度说明：${escapeHtml(report.confidence_note || "--")}</span>`;
      aiBody.innerHTML = html.replace(/\n/g, "<br>");
      aiBtn.textContent = "重新生成";
    } catch (e) {
      const noKey = String(e.message || e).includes("NO_KEY");
      aiBody.innerHTML = `<span class="ai-err">⚠️ AI 解释暂不可用${noKey ? "（未配置 AI，请前往 ⚙️ 设置；或使用后端代理）" : "（" + escapeHtml(String(e.message || e)) + "）"}。</span><br>
        <span class="hint">以下客观评分与导出数据不受影响。</span>`;
      aiBtn.textContent = "重试";
    }
    aiBtn.disabled = false;
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
}
