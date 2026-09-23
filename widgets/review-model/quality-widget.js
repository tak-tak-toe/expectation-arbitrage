import {
  DEADLINE, DEFAULT_WORKER, normalizeWorkerParameters, phi,
  oneReviewOutcome, propagateState, optimalQualityReviewTime,
} from "./model.js";
import {
  htmlElement, formatNumber, setOutput, createWidgetRoot, createControls,
  createMetrics, createPanel, createLegend, sampleRange, paddedDomain,
  createFrame, addPath, addVerticalLine, addHorizontalLine, addCircle,
  mountResponsive,
} from "./widget-utils.js";

// Chapter-local normalization: never mutate shared defaults or accept a rhoBar override.
export function chapterTwoWorker(initial = {}) {
  return normalizeWorkerParameters({ ...DEFAULT_WORKER, ...initial, rhoBar: 1 });
}

export function chapterTwoReview(x, initial = {}) {
  if (!Number.isFinite(x) || x < 0 || x > DEADLINE) throw new RangeError("Review time outside chapter interval.");
  const worker = chapterTwoWorker(initial);
  const result = oneReviewOutcome(x, DEADLINE - x, worker);
  return {
    ...result,
    recoverable: 1 - result.preReviewProductivity,
    recovery: result.postReviewProductivity - result.preReviewProductivity,
    usable: -Math.expm1(-worker.kappa * (DEADLINE - x)),
  };
}

const SPEEDS = [
  { key: "kappa", label: "限界生産性の低下速度 κ", min: 0.05, max: 0.6, step: 0.01, decimals: 2 },
  { key: "lambda", label: "理解・成果物の熟成速度 λ", min: 0.03, max: 1, step: 0.01, decimals: 2 },
];
const REVIEW_TIME = { key: "reviewTime", label: "レビュー時刻 x", min: 0, max: DEADLINE, step: 0.1, decimals: 1 };

function renderChapterTwo(mode, initial) {
  const defaults = { ...chapterTwoWorker(initial), reviewTime: 10 };
  const state = { ...defaults };
  const isQuality = mode === "quality";
  const titles = {
    recovery: ["レビュー時刻と回復幅", "各横軸の時刻で一度レビューする別々のケースを比較します。"],
    trajectory: ["一回のレビュー後の推移", "選んだ時刻で一度回復し、その後も同じκで低下します。"],
    quality: ["回復を最終品質へ変える", "三因子の積と最終品質を比べます。各図のスライダーは独立です。"],
  };
  const instance = createWidgetRoot(...titles[mode]);
  const controller = new AbortController();
  const cleanups = [() => controller.abort()];
  let render = () => {};
  let width = 680;
  createControls(instance, state, defaults, isQuality ? [
    { key: "qInfinity", label: "基準曲線の漸近値 Q∞", min: 40, max: 100, step: 1, decimals: 0 },
    ...SPEEDS,
  ] : [...SPEEDS, REVIEW_TIME], () => render(), controller.signal);
  const { container, metrics } = createMetrics(isQuality ? {
    time: "品質最大レビュー時刻 xQ*", quality: "最終品質", gain: "最終品質の上乗せ ΔQR", midpoint: "対称な基準 T/2",
  } : { before: "レビュー直前 p⁻", after: "レビュー直後 p⁺", recovery: "回復幅 ΔpR" });
  instance.root.append(container);
  const plots = htmlElement("div", "mw-plots");
  const details = htmlElement("div", "mw-details");
  instance.root.append(plots, details);

  function panel(key, title, note, yDomain, yLabel, lines, legends, markers = []) {
    const result = createPanel(title, note);
    const frame = createFrame({
      id: `${instance.id}-${key}`, width, xDomain: [0, DEADLINE], yDomain,
      title, description: note, xLabel: mode === "trajectory" ? "実経過時間 t（時間）" : "レビュー時刻 x（時間）", yLabel,
    });
    for (const [points, color] of lines) addPath(frame, points, color);
    for (const [type, x, y] of markers) {
      if (type === "point") addCircle(frame, x, y);
      else if (type === "horizontal") addHorizontalLine(frame, y);
      else addVerticalLine(frame, x, type === "midpoint" ? "mw-marker-accent" : "mw-marker");
    }
    result.chart.append(frame.svg);
    result.panel.append(createLegend(legends));
    plots.append(result.panel);
  }

  render = () => {
    const worker = chapterTwoWorker(state);
    const times = sampleRange(DEADLINE);
    const samples = times.map(x => ({ x, ...chapterTwoReview(x, worker) }));
    const series = key => samples.map(row => ({ x: row.x, y: row[key] }));
    plots.replaceChildren();
    if (isQuality) {
      const optimum = optimalQualityReviewTime({ worker, deadline: DEADLINE });
      const baseline = phi(DEADLINE, worker);
      const markers = [["midpoint", DEADLINE / 2], ["optimal", optimum.reviewTime]];
      panel("factors", "最終品質上乗せの三因子", "有効度と回復可能量は増え、利用可能量は減ります。", [0, 1], "因子の値", [
        [series("effectiveness"), "mw-accent"], [series("recoverable"), "mw-primary"], [series("usable"), "mw-secondary"],
      ], [["mw-swatch-accent", "有効度 ρ(x)"], ["mw-swatch-primary", "回復可能量 1−p⁻"], ["mw-swatch-secondary", "利用可能量"]]);
      panel("symmetry", "対称な積と熟成による重み", "灰色は回復可能量×利用可能量。青色はさらに有効度を掛けた ΔQR/Q∞。", [0, 1], "品質尺度で割った上乗せ", [
        [samples.map(r => ({ x: r.x, y: r.recoverable * r.usable })), "mw-muted"],
        [samples.map(r => ({ x: r.x, y: r.qualityGain / worker.qInfinity })), "mw-primary"],
      ], [["mw-swatch-muted", "対称な二因子の積"], ["mw-swatch-primary", "三因子の積"], ["mw-swatch-accent", "T/2"], ["mw-swatch-secondary", "xQ*"]], markers);
      panel("quality", "レビュー時刻と最終品質", "基準品質 Φ(T) への上乗せが最大となる時刻を選びます。", paddedDomain(samples.map(r => r.finalQuality), { nonnegative: true }), "最終品質 Qᵀᴿ(x)", [
        [series("finalQuality"), "mw-primary"],
      ], [["mw-swatch-primary", "レビューありの最終品質"], ["mw-swatch-threshold", "レビューなし Φ(T)"], ["mw-swatch-accent", "T/2"], ["mw-swatch-secondary", "xQ*"]], [...markers, ["horizontal", 0, baseline], ["point", optimum.reviewTime, optimum.finalQuality]]);
      for (const [key, value] of Object.entries({ time: optimum.reviewTime, quality: optimum.finalQuality, gain: optimum.finalQuality - baseline, midpoint: DEADLINE / 2 })) setOutput(metrics[key].output, formatNumber(value));
      instance.status.textContent = "理解・成果物の熟成を反映した品質最大点";
      details.textContent = `λを大きくすると最適時刻は対称な基準 ${DEADLINE / 2} に近づきます。κは作業中の生産性低下を決めます。`;
    } else {
      const x = state.reviewTime;
      const selected = chapterTwoReview(x, worker);
      if (mode === "recovery") {
        panel("recovery", "その時刻でレビューした場合の直前と直後", "二曲線の縦の差が回復幅です。p⁺の曲線は一人の時間的な軌跡とは区別します。", [0, 1], "相対限界生産性", [
          [series("preReviewProductivity"), "mw-muted"], [series("postReviewProductivity"), "mw-primary"],
          [[{ x, y: selected.preReviewProductivity }, { x, y: selected.postReviewProductivity }], "mw-secondary"],
        ], [["mw-swatch-muted", "レビュー直前 p⁻(x)"], ["mw-swatch-primary", "その時刻でのレビュー直後 p⁺(x)"], ["mw-swatch-secondary", "選択時刻の回復幅"]], [["selected", x], ["point", x, selected.preReviewProductivity], ["point", x, selected.postReviewProductivity]]);
        panel("gain", "回復幅を決める二つの要因", "レビュー有効度×回復可能量が回復幅 ΔpR です。", [0, 1], "比率・回復幅", [
          [series("effectiveness"), "mw-accent"], [series("recoverable"), "mw-muted"], [series("recovery"), "mw-secondary"],
        ], [["mw-swatch-accent", "有効度 ρ(x)"], ["mw-swatch-muted", "回復可能量 1−p⁻(x)"], ["mw-swatch-secondary", "回復幅 ΔpR(x)"]], [["selected", x]]);
      } else {
        const before = sampleRange(x).map(t => ({ x: t, y: Math.exp(-worker.kappa * t) }));
        const after = sampleRange(DEADLINE, 321, x).map(t => ({ x: t, y: propagateState(selected.afterReviewState, t - x, worker).productivity }));
        panel("trajectory", "レビューで回復し、再び低下する p", "縦のジャンプがレビュー。前後の指数減衰率は同じκです。", [0, 1], "相対限界生産性 p", [
          [times.map(t => ({ x: t, y: Math.exp(-worker.kappa * t) })), "mw-muted"],
          [[...before, ...after], "mw-primary"],
        ], [["mw-swatch-muted", "レビューなし"], ["mw-swatch-primary", "時刻xで一回レビュー"]], [["selected", x], ["point", x, selected.preReviewProductivity], ["point", x, selected.postReviewProductivity]]);
      }
      for (const [key, value] of Object.entries({ before: selected.preReviewProductivity, after: selected.postReviewProductivity, recovery: selected.recovery })) setOutput(metrics[key].output, formatNumber(value));
      instance.status.textContent = `選択したレビュー時刻 x = ${formatNumber(x)}`;
      details.textContent = "λは理解・成果物の熟成、κは相対限界生産性の低下を表します。この図の設定は他の図から独立しています。";
    }
    instance.root.setAttribute("aria-busy", "false");
  };
  mountResponsive(plots, nextWidth => { width = nextWidth; render(); }, cleanups);
  instance.root.dispose = () => { for (const cleanup of cleanups.splice(0)) cleanup(); };
  return instance.root;
}

export const renderRecoveryReviewWidget = (initial = {}) => renderChapterTwo("recovery", initial);
export const renderProductivityTrajectoryWidget = (initial = {}) => renderChapterTwo("trajectory", initial);
export const renderQualityReviewWidget = (initial = {}) => renderChapterTwo("quality", initial);
