import {
  DEADLINE,
  DEFAULT_WORKER,
  phi,
  reviewEffectiveness,
  oneReviewQualityForFixedTotal,
  fullResetBenchmarkQuality,
  optimalQualityReviewTime,
  optimalFullResetReviewTime,
} from "./model.js";
import {
  htmlElement,
  formatNumber,
  setOutput,
  createWidgetRoot,
  createControls,
  createMetrics,
  createPanel,
  createLegend,
  sampleRange,
  paddedDomain,
  createFrame,
  addPath,
  addVerticalLine,
  addHorizontalLine,
  addCircle,
  mountResponsive,
} from "./widget-utils.js";

const DEFAULTS = Object.freeze({ ...DEFAULT_WORKER });
const CONTROLS = Object.freeze([
  { key: "qInfinity", label: "品質上限 Q∞", min: 40, max: 100, step: 1, decimals: 0 },
  { key: "kappa", label: "品質改善速度 κ", min: 0.05, max: 0.6, step: 0.01, decimals: 2 },
  { key: "rhoBar", label: "最大レビュー効果 ρ̄", min: 0, max: 1, step: 0.05, decimals: 2 },
  { key: "lambda", label: "成熟速度 λ", min: 0.03, max: 1, step: 0.01, decimals: 2 },
]);

function worker(state) {
  return {
    qInfinity: state.qInfinity,
    kappa: state.kappa,
    rhoBar: state.rhoBar,
    lambda: state.lambda,
  };
}

function drawPanels(instance, panels, state, optimum, width) {
  const times = sampleRange(DEADLINE);
  const parameters = worker(state);
  const partialQuality = times.map(x => ({
    x,
    y: oneReviewQualityForFixedTotal(x, DEADLINE, parameters),
  }));
  const fullResetQuality = times.map(x => ({
    x,
    y: fullResetBenchmarkQuality(x, DEADLINE - x, parameters),
  }));
  const effectiveness = times.map(x => ({
    x,
    y: reviewEffectiveness(x, parameters),
  }));
  const baseline = phi(DEADLINE, parameters);

  const qualityFrame = createFrame({
    id: `${instance.id}-quality`,
    width,
    xDomain: [0, DEADLINE],
    yDomain: paddedDomain([
      ...partialQuality.map(point => point.y),
      ...fullResetQuality.map(point => point.y),
      baseline,
    ], { nonnegative: true }),
    title: "中間レビュー時刻と最終品質",
    description: optimum.reviewTime === null
      ? "成熟型レビューの最終品質は全時刻で同値。"
      : `成熟型レビューの最終品質は時刻${formatNumber(optimum.reviewTime)}で最大。`,
    xLabel: "中間レビュー時刻 x",
    yLabel: "最終品質 QT(x)",
  });
  addPath(qualityFrame, partialQuality, "mw-primary");
  addPath(qualityFrame, fullResetQuality, "mw-secondary");
  addHorizontalLine(qualityFrame, baseline);
  addVerticalLine(qualityFrame, DEADLINE / 2, "mw-marker-accent");
  if (optimum.reviewTime !== null) {
    addVerticalLine(qualityFrame, optimum.reviewTime);
    addCircle(qualityFrame, optimum.reviewTime, optimum.finalQuality);
  }
  panels.quality.chart.replaceChildren(qualityFrame.svg);

  const readinessFrame = createFrame({
    id: `${instance.id}-readiness`,
    width,
    xDomain: [0, DEADLINE],
    yDomain: [0, 1],
    title: "レビュー有効度",
    description: "レビュー前作業量に応じて増える有効度ρ(x)。",
    xLabel: "レビュー前作業量 x",
    yLabel: "ρ(x)",
  });
  addPath(readinessFrame, effectiveness, "mw-accent");
  if (optimum.reviewTime !== null) {
    addVerticalLine(readinessFrame, optimum.reviewTime);
    addCircle(
      readinessFrame,
      optimum.reviewTime,
      reviewEffectiveness(optimum.reviewTime, parameters),
    );
  }
  panels.readiness.chart.replaceChildren(readinessFrame.svg);
}

export function renderQualityReviewWidget(initial = {}) {
  const defaults = { ...DEFAULTS, ...initial };
  const state = { ...defaults };
  const instance = createWidgetRoot(
    "レビューによる品質改善",
    `総作業量 T = ${DEADLINE} をレビュー前後へ配分し、最終品質を比較します。`,
  );
  const controller = new AbortController();
  const cleanups = [() => controller.abort()];
  let width = 680;
  let render = () => {};

  createControls(instance, state, defaults, CONTROLS, () => render(), controller.signal);
  const { container: metricContainer, metrics } = createMetrics({
    reviewTime: "品質最大レビュー時刻 xQ*",
    finalQuality: "最終品質 QT(xQ*)",
    qualityGain: "基準品質からの上乗せ",
    effectiveness: "レビュー有効度 ρ(xQ*)",
    benchmark: "完全リセット基準 T/2",
  });
  instance.root.append(metricContainer);

  const plots = htmlElement("div", "mw-plots");
  const panels = {
    quality: createPanel("最終品質", "成熟型レビュー、完全リセット基準、基準品質 Φ(T) を比較します。"),
    readiness: createPanel("レビュー有効度", "λ は立ち上がり速度、ρ̄ は到達する最大効果を表します。"),
  };
  panels.quality.panel.append(createLegend([
    ["mw-swatch-primary", "成熟型レビュー QT(x)"],
    ["mw-swatch-secondary", "理論的な完全リセット"],
    ["mw-swatch-threshold", "基準品質 Φ(T)"],
    ["mw-swatch-accent", "完全リセットの中心 T/2"],
  ]));
  panels.readiness.panel.append(createLegend([
    ["mw-swatch-accent", "レビュー有効度 ρ(x)"],
    ["mw-swatch-secondary", "品質最大時刻"],
  ]));
  plots.append(panels.quality.panel, panels.readiness.panel);
  const details = htmlElement("div", "mw-details");
  instance.root.append(plots, details);

  render = () => {
    const parameters = worker(state);
    const optimum = optimalQualityReviewTime({ worker: parameters, deadline: DEADLINE });
    const benchmark = optimalFullResetReviewTime({ worker: parameters, deadline: DEADLINE });
    const baseline = phi(DEADLINE, parameters);
    const selectedEffectiveness = optimum.reviewTime === null
      ? null
      : reviewEffectiveness(optimum.reviewTime, parameters);
    const gain = optimum.finalQuality - baseline;
    setOutput(metrics.reviewTime.output,
      optimum.reviewTime === null ? `0–${DEADLINE}` : formatNumber(optimum.reviewTime));
    setOutput(metrics.finalQuality.output, formatNumber(optimum.finalQuality));
    setOutput(metrics.qualityGain.output, formatNumber(gain));
    setOutput(metrics.effectiveness.output,
      selectedEffectiveness === null ? "全域" : formatNumber(selectedEffectiveness));
    setOutput(metrics.benchmark.output, formatNumber(benchmark.reviewTime));

    if (optimum.status === "indifferent") {
      instance.status.textContent = "全レビュー時刻が同値";
      instance.status.dataset.state = "boundary";
      details.replaceChildren(
        htmlElement("p", undefined,
          `ρ̄ = 0 ではレビュー効果がゼロとなり、QT(x) = Φ(T) = ${formatNumber(baseline)} が全時刻で成立します。`),
        htmlElement("p", undefined,
          `品質最大時刻の集合は区間 [0, ${DEADLINE}] です。`),
      );
    } else {
      instance.status.textContent = "成熟型レビューの品質最大点";
      instance.status.dataset.state = "interior";
      details.replaceChildren(
        htmlElement("p", undefined,
          `xQ* = ${formatNumber(optimum.reviewTime)}、レビュー後作業は ${formatNumber(DEADLINE - optimum.reviewTime)}、ρ(xQ*) = ${formatNumber(selectedEffectiveness)} です。`),
        htmlElement("p", undefined,
          `完全リセット基準は ${formatNumber(benchmark.reviewTime)}、成熟型レビューは成果物の成熟を反映して右側に位置します。`),
      );
    }
    drawPanels(instance, panels, state, optimum, width);
    instance.root.setAttribute("aria-busy", "false");
  };

  mountResponsive(plots, nextWidth => {
    width = nextWidth;
    render();
  }, cleanups);

  instance.root.dispose = () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
  return instance.root;
}
