/* ==================== AI 层：生成综合解释 ====================
 * 优先级：① 后端代理（Key 在服务器环境变量）→ ② 纯前端直连（用户自带 Key，仅 sessionStorage）。
 * 可配置：供应商 baseUrl、模型名、temperature、超时、重试次数。
 * 输入只含结构化指标与客观分；输出必须是 JSON，AI 不得修改客观分、不得做医学诊断。 */

function cfg() { return window.__getAiCfg(); }

function buildPrompt(payload) {
  const dimsText = Object.entries(payload.dimension_scores)
    .map(([k, v]) => `${k}：${v.score === null ? "缺失" : v.score + " 分（" + v.level + "）"}`)
    .join("；");
  return `你是一名认知测评助手。以下是用户在一次注意力与记忆力标准化自测中的结构化指标和程序计算的客观维度分。请只基于这些数据生成解读。

【重要约束】
1. 不得修改任何客观分数；
2. 不得做医学诊断，不得建议用药；
3. 若数据量小或存在缺失，须在置信度说明中明确指出；
4. 只输出一个 JSON 对象，不要输出其他文字，格式：
{"overall":"总评（2~3 句）","dimensions":{"维度名":"该维度表现解释（1~2 句）"},"suggestions":["建议1","建议2","建议3"],"confidence_note":"置信度说明"}

【六维度客观分】
${dimsText}

【各任务指标】
${JSON.stringify(payload.task_metrics)}

【背景信息】
${JSON.stringify(payload.participant)}`;
}

function extractJson(text) {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("AI 返回中未找到 JSON");
  return JSON.parse(text.slice(s, e + 1));
}

async function fetchWithTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function generateReport(payload) {
  const c = cfg();
  const body = {
    model: c.model,
    temperature: c.temperature,
    messages: [
      { role: "system", content: "你是严谨、克制的认知测评解读助手，只输出 JSON。" },
      { role: "user", content: buildPrompt(payload) },
    ],
  };

  /* ① 后端代理：Key 在服务器环境变量，前端只发指标包 */
  if (c.proxy) {
    try {
      const res = await fetchWithTimeout(c.proxy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: payload }),
      }, c.timeoutMs);
      if (!res.ok) throw new Error("代理返回 " + res.status);
      const data = await res.json();
      return extractJson(data.report || data.content || data.text || (typeof data === "string" ? data : JSON.stringify(data)));
    } catch (e) {
      if (!c.apiKey) throw e;   // 无 Key 则直接走降级
      /* 代理失败但有 Key → 继续尝试直连 */
    }
  }

  /* ② 纯前端直连（OpenAI 兼容 chat/completions） */
  if (!c.apiKey) throw new Error("NO_KEY");

  let lastErr;
  for (let attempt = 0; attempt <= c.retries; attempt++) {
    try {
      const res = await fetchWithTimeout(c.baseUrl.replace(/\/$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.apiKey },
        body: JSON.stringify(body),
      }, c.timeoutMs);
      if (!res.ok) throw new Error("接口返回 " + res.status + (attempt < c.retries ? "，重试中" : ""));
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      return extractJson(text);
    } catch (e) {
      lastErr = e;
      if (attempt < c.retries) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastErr || new Error("AI 调用失败");
}
