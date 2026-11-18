/* ==================== 三档测试版本配置（唯一真源） ====================
 * 三个版本共用同一套任务组件，只在这里通过参数控制试次数 / 时长 / 难度。
 * 任务组件通过 ctx.cfg 读取本文件 params（见 app.js 的 taskCtx）。
 * 新增版本或调整强度：只改本文件，不改任务代码。 */
const VERSIONS = {
  quick: {
    id: "quick",
    name: "快速版",
    minutes: 5,
    timeLabel: "约 5 分钟",
    reliability: "较低",
    reliabilityShort: "样本较少，仅供参考",
    tag: "尝鲜首选",
    summary: "试次精简，适合先体验流程、看看自己大概在什么水平。",
    covers: "反应速度、选择性注意、持续注意（粗略）",
    scenes: "碎片时间尝鲜 / 第一次了解这个测试",
    tasks: {
      srt:       { enabled: true, practice: 3, formal: 5 },
      schulte:   { enabled: true, size: 4, boards: 1 },
      stroop:    { enabled: true, practice: 8, formal: 16 },
      cancel:    { enabled: true, seconds: 30, targets: 10 },
      gonogo:    { enabled: true, practice: 8, formal: 30, goRatio: 0.8 },
      nback:     { enabled: true, practice: 6, formal: 20, matchRate: 0.3 },
      digitspan: { enabled: true, maxTrials: 3, startLen: 3 },
      survey:    { enabled: true, items: ["sleep_hours", "caffeine", "fatigue"] },
    },
  },
  standard: {
    id: "standard",
    name: "标准版",
    minutes: 12,
    timeLabel: "约 12 分钟",
    reliability: "中等",
    reliabilityShort: "试次适中，指标较稳定",
    tag: "推荐",
    summary: "时长与稳定性平衡，适合大多数人做一次认真自测。",
    covers: "六个维度全覆盖",
    scenes: "想了解自己注意力与记忆的整体状况",
    tasks: {
      srt:       { enabled: true, practice: 3, formal: 8 },
      schulte:   { enabled: true, size: 5, boards: 1 },
      stroop:    { enabled: true, practice: 8, formal: 28 },
      cancel:    { enabled: true, seconds: 45, targets: 14 },
      gonogo:    { enabled: true, practice: 10, formal: 50, goRatio: 0.8 },
      nback:     { enabled: true, practice: 8, formal: 36, matchRate: 0.3 },
      digitspan: { enabled: true, maxTrials: 5, startLen: 3 },
      survey:    { enabled: true, items: ["sleep_hours", "caffeine", "fatigue", "screen_time", "mood"] },
    },
  },
  full: {
    id: "full",
    name: "完整版",
    minutes: 20,
    timeLabel: "约 20 分钟",
    reliability: "较高",
    reliabilityShort: "试次充足，指标最稳定",
    tag: "认真自测",
    summary: "试次更多，个体内比较更可靠，适合想认真记录一次基线的人。",
    covers: "六个维度全覆盖，效应量更稳定",
    scenes: "认真自测 / 隔一段时间复测对比自己的变化",
    tasks: {
      srt:       { enabled: true, practice: 5, formal: 12 },
      schulte:   { enabled: true, size: 5, boards: 2 },
      stroop:    { enabled: true, practice: 8, formal: 48 },
      cancel:    { enabled: true, seconds: 60, targets: 20 },
      gonogo:    { enabled: true, practice: 12, formal: 80, goRatio: 0.8 },
      nback:     { enabled: true, practice: 10, formal: 56, matchRate: 0.3 },
      digitspan: { enabled: true, maxTrials: 8, startLen: 3 },
      survey:    { enabled: true, items: ["sleep_hours", "caffeine", "fatigue", "screen_time", "mood", "note"] },
    },
  },
};

const VERSION_ORDER = ["quick", "standard", "full"];
const DEFAULT_VERSION = "standard";   // 默认选中标准版（快速版只做显眼入口，不默认）

/* 诚实说明：三个版本共用一套组件，但试次不同，分数不可横向比较 */
const VERSION_NOTE = "试次越多，指标越稳定，但不是线性提升；不同版本的分数不能直接横向比较。";

/* 各任务显示名（结果页、分享卡片共用） */
const TASK_TITLES = {
  srt: "简单反应时",
  schulte: "舒尔特方格",
  stroop: "Stroop 色词干扰",
  cancel: "数字划消",
  gonogo: "Go / No-Go",
  nback: "2-back 工作记忆",
  digitspan: "数字广度",
};

function getVersion(id) {
  return VERSIONS[id] || VERSIONS[DEFAULT_VERSION];
}
function getVersionTaskCfg(versionId, taskId) {
  const v = getVersion(versionId);
  return (v.tasks && v.tasks[taskId]) || {};
}
/* 该版本实际执行的任务列表（按固定顺序） */
const TASK_ORDER = ["srt", "schulte", "stroop", "cancel", "gonogo", "nback", "digitspan"];
function versionTaskList(versionId) {
  const v = getVersion(versionId);
  return TASK_ORDER.filter((t) => v.tasks[t] && v.tasks[t].enabled !== false);
}
