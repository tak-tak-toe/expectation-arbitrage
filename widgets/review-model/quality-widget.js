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
  { key: "lambda", label: "レビュー材料の成熟速度 λ", min: 0.03, max: 1, step: 0.01, decimals: 2 },
  { key: "kappa", label: "限界生産性の低下速度 κ", min: 0.05, max: 0.6, step: 0.01, decimals: 2 },
];
const REVIEW_TIME = { key: "reviewTime", label: "レビュー時刻 x", min: 0, max: DEADLINE, step: 0.1, decimals: 1 };

function renderChapterTwo(mode, initial) {
  const defaults = { ...chapterTwoWorker({ ...initial, qInfinity: DEFAULT_WORKER.qInfinity }), reviewTime: 10 };
  const state = { ...defaults };
  const isQuality = mode === "quality";
  const titles = {
    recovery: ["レビュー時刻と回復幅", "各横軸の時刻で一度レビューする別々のケースを比較します。"],
    trajectory: ["一回のレビュー後の推移", "選んだ時刻で一度回復し、その後も同じκで低下します。"],
    quality: ["レビュー材料の成熟速度と最適時刻", "λを大きくするとレビュー材料がより早く成熟し、他条件一定では最適レビュー時刻が前方へ移ります。灰色はλを初期値に保った比較です。"],
  };
  const instance = createWidgetRoot(...titles[mode]);
  const controller = new AbortController();
  const cleanups = [() => controller.abort()];
  let render = () => {};
  let width = 680;
  createControls(instance, state, defaults, isQuality ? SPEEDS : [...SPEEDS, REVIEW_TIME], () => render(), controller.signal);
  const { container, metrics } = createMetrics(isQuality ? {
    time: "品質最大レビュー時刻 xQ*", quality: "最終品質", gain: "最終品質の上乗せ ΔQR", shift: "比較設定からの時刻差（時間）",
  } : { before: "レビュー直前 p⁻", after: "レビュー直後 p⁺", recovery: "回復幅 ΔpR" });
  instance.root.append(container);
  const plots = htmlElement("div", "mw-plots");
  const details = htmlElement("div", "mw-details");
  instance.root.append(plots, details);

  function panel(key, title, note, yDomain, yLabel, lines, legends, markers = []) {
    const result = createPanel(title, note);
    const frame = createFrame({
      id: `${instance.id}-${key}`, width, xDomain: [0, DEADLINE], yDomain,
      title, description: note, xLabel: mode === "trajectory" ? "作業時間 t（時間）" : "レビュー時刻 x（時間）", yLabel,
    });
    for (const [points, color] of lines) addPath(frame, points, color);
    for (const [type, x, y] of markers) {
      if (type === "point") addCircle(frame, x, y);
      else if (type === "horizontal") addHorizontalLine(frame, y);
      else addVerticalLine(frame, x);
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
      // Hold all conditions except lambda equal to isolate its comparative statics.
      const referenceWorker = chapterTwoWorker({ ...worker, lambda: defaults.lambda });
      const reference = optimalQualityReviewTime({ worker: referenceWorker, deadline: DEADLINE });
      const referenceQuality = times.map(x => ({ x, y: chapterTwoReview(x, referenceWorker).finalQuality }));
      panel("quality", "レビュー材料の成熟速度と最終品質", "現在の曲線の最大点と縦線が最適レビュー時刻。灰色はλだけを初期値に保った比較曲線です。",
        paddedDomain([...samples.map(r => r.finalQuality), ...referenceQuality.map(r => r.y)], { nonnegative: true }),
        "最終品質 Q_T^(R)(x)", [
          [referenceQuality, "mw-muted"], [series("finalQuality"), "mw-primary"],
        ], [
          ["mw-swatch-muted", "比較：λ = " + formatNumber(defaults.lambda)],
          ["mw-swatch-primary", "現在：λ = " + formatNumber(worker.lambda)],
          ["mw-swatch-threshold", "レビューなし Φ(T)"],
          ["mw-swatch-secondary", "現在の最適時刻 xQ*"],
        ], [["optimal", optimum.reviewTime], ["horizontal", 0, baseline], ["point", optimum.reviewTime, optimum.finalQuality]]);
      panel("factors", "最終品質上乗せの三因子", "材料の成熟速度λを変えるとレビュー有効度の曲線が変わります。回復可能量・利用可能量はκと残り時間で決まります。", [0, 1], "因子の値", [
        [series("effectiveness"), "mw-accent"], [series("recoverable"), "mw-primary"], [series("usable"), "mw-secondary"],
      ], [["mw-swatch-accent", "レビュー有効度 ρ(x)"], ["mw-swatch-primary", "回復可能量 1−p⁻"], ["mw-swatch-secondary", "利用可能量"]]);
      const shift = optimum.reviewTime - reference.reviewTime;
      for (const [key, value] of Object.entries({ time: optimum.reviewTime, quality: optimum.finalQuality, gain: optimum.finalQuality - baseline, shift })) setOutput(metrics[key].output, formatNumber(value));
      instance.status.textContent = worker.lambda === defaults.lambda
        ? "λを動かして最適レビュー時刻を比較"
        : worker.lambda > defaults.lambda
          ? "レビュー材料の成熟が速い → 最適レビュー時刻が前方へ移る"
          : "レビュー材料の成熟が遅い → 最適レビュー時刻が後方へ移る";
      details.textContent = "比較設定の最適時刻は " + formatNumber(reference.reviewTime)
        + " 時間、現在は " + formatNumber(optimum.reviewTime)
        + " 時間です。κとQ∞を揃えてλだけの影響を比べています。";
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
        ], [["mw-swatch-accent", "レビュー有効度 ρ(x)"], ["mw-swatch-muted", "回復可能量 1−p⁻(x)"], ["mw-swatch-secondary", "回復幅 ΔpR(x)"]], [["selected", x]]);
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
      details.textContent = "λはレビュー材料の成熟速度、κは相対限界生産性の低下速度を表します。この図の設定は他の図から独立しています。";
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
