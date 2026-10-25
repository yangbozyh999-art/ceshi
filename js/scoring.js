/* ==================== 规则层评分：原始指标 → 六维度客观分（0-100） ====================
 * 只依据程序计算的结构化指标映射，AI 不得修改本层结果。
 * 缺失某任务时跳过该子项，维度分由其余子项均值构成；全部缺失则该维度为 null。 */
import { clamp100 } from "./helpers.js";

/* 各子项：[指标值, 最差→最好区间] → 0-100 */
function sub(x, lo, hi) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const t = Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  return Math.round(t * 100);
}
const avg = (arr) => {
  const v = arr.filter((x) => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};
const M = (metrics, id) => (metrics[id] && !metrics[id].skipped) ? metrics[id] : {};

export function computeDims(state) {
  const m = state.metrics || {};

  const srt = M(m, "srt");           // median_rt, cv
  const sch = M(m, "schulte");       // median_time_s, errors
  const str = M(m, "stroop");        // accuracy, congruent_median, incongruent_median, stroop_effect
  const can = M(m, "cancel");        // hits, missed, false_hits, speed
  const gng = M(m, "gonogo");        // go_median_rt, omission_rate, commission_rate, cv_go, dprime
  const nb  = M(m, "nback");         // hit_rate, fa_rate, dprime, accuracy
  const ds  = M(m, "digitspan");     // max_span

  /* 各子项分 */
  const sSpeed   = sub(srt.median_rt, 450, 220);
  const gSpeed   = sub(gng.go_median_rt, 650, 300);
  const schScore = sub(sch.median_time_s, 75, 25);           // 5×5 完成时间（秒）
  const stroopAcc= sub(str.accuracy, 0.6, 0.98);
  const stroopEff= sub(str.stroop_effect, 250, 20);          // 干扰量越小越好
  const schErr   = sub(sch.errors, 10, 0);
  const canSpeed = sub(can.speed, 4, 14);                    // 每分钟命中数
  const canMiss  = sub(can.missed, 12, 0);
  const commiss  = sub(gng.commission_rate, 0.4, 0);
  const omiss    = sub(gng.omission_rate, 0.3, 0);
  const nbHit    = sub(nb.hit_rate, 0.4, 1);
  const nbDp     = sub(nb.dprime, 0, 3.5);
  const span     = sub(ds.max_span, 3, 9);
  const cvStab   = sub(srt.cv, 0.35, 0.08);
  const cvGo     = sub(gng.cv_go, 0.45, 0.1);
  const canFalse = sub(can.false_hits, 12, 0);

  /* 六维度：子项均值（缺失自动跳过） */
  const dims = {
    "反应速度":   avg([sSpeed, gSpeed]),
    "选择性注意": avg([schScore, stroopEff, schErr]),
    "抑制控制":   avg([commiss, stroopEff, canFalse]),
    "持续注意":   avg([omiss, canMiss, nbHit]),
    "工作记忆":   avg([nbDp, span]),
    "稳定性":     avg([cvStab, cvGo]),
  };

  const level = (v) => v === null ? "—" : v >= 80 ? "优秀" : v >= 60 ? "良好" : v >= 40 ? "一般" : "待提升";
  const out = {};
  for (const [k, v] of Object.entries(dims)) {
    out[k] = { score: v, level: level(v) };
  }
  return { dims: out };
}

/* 供 AI 输入的结构化指标包（AI 只允许读取这些） */
export function buildAiPayload(state, dims) {
  return {
    participant: {
      age: state.info.age ?? null,
      device_type: state.info.device_type ?? null,
      input_method: state.info.input_method ?? null,
      sleep_hours: state.info.sleep_hours ?? null,
      caffeine: state.info.caffeine ?? null,
      fatigue: state.info.fatigue ?? null,
    },
    task_metrics: state.metrics,
    dimension_scores: dims,
  };
}
