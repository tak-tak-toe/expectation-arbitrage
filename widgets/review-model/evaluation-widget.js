import {
  DEADLINE,
  DEFAULT_WORKER,
  DEFAULT_MANAGER,
  oneTaskObjectives,
  optimalReviewScoreTime,
  optimalQualityReviewTime,
  optimalAggregateReviewTime,
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
  addCircle,
  addDiamond,
  mountResponsive,
} from "./widget-utils.js";

const DEFAULTS = Object.freeze({
  ...DEFAULT_WORKER,
  ...DEFAULT_MANAGER,
  omega: 0.5,
});

const CONTROLS = Object.freeze([
  { key: "qInfinity", label: "品質上限 Q∞", min: 40, max: 100, step: 1, decimals: 0 },
  { key: "kappa", label: "品質改善速度 κ", min: 0.05, max: 0.6, step: 0.01, decimals: 2 },
  { key: "e0", label: "初期要求水準 E₀", min: 0, max: 80, step: 1, decimals: 0 },
  { key: "beta", label: "期待上昇率 β", min: 0, max: 20, step: 0.25, decimals: 2 },
  { key: "rhoBar", label: "最大レビュー効果 ρ̄", min: 0, max: 1, step: 0.05, decimals: 2 },
  { key: "lambda", label: "成熟速度 λ", min: 0.03, max: 1, step: 0.01, decimals: 2 },
  { key: "omega", label: "最終レビューの重み ω", min: 0, max: 1, step: 0.05, decimals: 2 },
]);

function parameters(state) {
  return {
    worker: {
      qInfinity: state.qInfinity,
      kappa: state.kappa,
      rhoBar: state.rhoBar,
      lambda: state.lambda,
    },
    manager: { e0: state.e0, beta: state.beta },
    deadline: DEADLINE,
    omega: state.omega,
  };
}

function drawPanel(instance, panel, state, optima, width) {
  const config = parameters(state);
  const points = sampleRange(DEADLINE).map(x => ({ x, ...oneTaskObjectives(x, config) }));
  const intermediate = points.map(point => ({ x: point.x, y: point.intermediateScore }));
  const final = points.map(point => ({ x: point.x, y: point.finalScore }));
  const aggregate = points.map(point => ({ x: point.x, y: point.weightedScore }));
  const frame = createFrame({
    id: `${instance.id}-evaluation`,
    width,
    height: 250,
    xDomain: [0, DEADLINE],
    yDomain: paddedDomain([
      ...intermediate.map(point => point.y),
      ...final.map(point => point.y),
      ...aggregate.map(point => point.y),
    ]),
    title: "中間レビュー評価、最終レビュー評価、総合評価",
    description: "三つの目的が選ぶレビュー時刻を一つの座標上で比較する。",
    xLabel: "中間レビュー時刻 x",
    yLabel: "評価",
  });
  addPath(frame, intermediate, "mw-primary");
  addPath(frame, final, "mw-accent");
  addPath(frame, aggregate, "mw-secondary");

  const reviewTime = optima.review.reviewTime;
  addVerticalLine(frame, reviewTime, "mw-muted");
  addDiamond(frame, reviewTime, oneTaskObjectives(reviewTime, config).intermediateScore);
  if (optima.quality.reviewTime !== null) {
    const qualityTime = optima.quality.reviewTime;
    addVerticalLine(frame, qualityTime, "mw-marker-accent");
    addCircle(
      frame,
      qualityTime,
      oneTaskObjectives(qualityTime, config).finalScore,
      "mw-point-accent",
    );
  }
  if (optima.aggregate.reviewTime !== null) {
    const aggregateTime = optima.aggregate.reviewTime;
    addVerticalLine(frame, aggregateTime);
    addCircle(
      frame,
      aggregateTime,
      oneTaskObjectives(aggregateTime, config).weightedScore,
    );
  }
  panel.chart.replaceChildren(frame.svg);
}

export function renderOverallEvaluationWidget(initial = {}) {
  const defaults = { ...DEFAULTS, ...initial };
  const state = { ...defaults };
  const instance = createWidgetRoot(
    "三つの目的をつなぐ",
    "中間レビュー評価、最終レビュー評価、両者を結ぶ重み付き総合評価を比較します。",
  );
  const controller = new AbortController();
  const cleanups = [() => controller.abort()];
  let width = 680;
  let render = () => {};

  createControls(instance, state, defaults, CONTROLS, () => render(), controller.signal);
  const { container: metricContainer, metrics } = createMetrics({
    reviewOptimum: "レビュー時評価の最適時刻 xR*",
    aggregateOptimum: "総合評価の最適時刻 xJ*",
    weightedOptimum: "加重評価の最適時刻 xJ,ω*",
    qualityOptimum: "最終品質の最適時刻 xQ*",
    intermediateScore: "S₁(xJ,ω*)",
    finalScore: "S₂(xJ,ω*)",
    totalScore: "J(xJ,ω*) = S₁ + S₂",
    weightedScore: "Jω(xJ,ω*)",
  });
  instance.root.append(metricContainer);

  const plots = htmlElement("div", "mw-plots");
  const panel = createPanel(
    "レビュー時刻と三つの評価",
    "ω = 0 は中間レビュー、ω = 1 は最終レビュー、ω = 0.5 は単純和と同じ最大点を与えます。",
  );
  panel.panel.append(createLegend([
    ["mw-swatch-primary", "中間レビュー評価 S₁(x)"],
    ["mw-swatch-accent", "最終レビュー評価 S₂(x)"],
    ["mw-swatch-secondary", "重み付き総合評価 Jω(x)"],
    ["mw-swatch-muted", "xR*"],
  ]));
  plots.append(panel.panel);
  const details = htmlElement("div", "mw-details");
  instance.root.append(plots, details);

  render = () => {
    const config = parameters(state);
    const review = optimalReviewScoreTime(config);
    const quality = optimalQualityReviewTime(config);
    const aggregate = optimalAggregateReviewTime({ ...config, omega: 0.5 });
    const weighted = state.omega === 0.5
      ? aggregate
      : optimalAggregateReviewTime(config);
    const selected = weighted.reviewTime === null
      ? null
      : oneTaskObjectives(weighted.reviewTime, config);

    setOutput(metrics.reviewOptimum.output, formatNumber(review.reviewTime));
    setOutput(metrics.qualityOptimum.output,
      quality.reviewTime === null ? `0–${DEADLINE}` : formatNumber(quality.reviewTime));
    setOutput(metrics.aggregateOptimum.output,
      aggregate.reviewTime === null ? `0–${DEADLINE}` : formatNumber(aggregate.reviewTime));
    setOutput(metrics.weightedOptimum.output,
      weighted.reviewTime === null ? `0–${DEADLINE}` : formatNumber(weighted.reviewTime));
    setOutput(metrics.intermediateScore.output,
      selected === null ? "全域" : formatNumber(selected.intermediateScore));
    setOutput(metrics.finalScore.output,
      selected === null ? "全域" : formatNumber(selected.finalScore));
    setOutput(metrics.totalScore.output,
      selected === null ? "全域" : formatNumber(selected.totalScore));
    setOutput(metrics.weightedScore.output,
      selected === null ? "全域" : formatNumber(selected.weightedScore));

    const strictBracket = aggregate.reviewTime !== null
      && quality.reviewTime !== null
      && review.reviewTime < aggregate.reviewTime
      && aggregate.reviewTime < quality.reviewTime;
    if (strictBracket) {
      instance.status.textContent = "三つの最適時刻が順に並ぶ設定";
      instance.status.dataset.state = "interior";
    } else if (weighted.reviewTime === null) {
      instance.status.textContent = "総合評価が全時刻で同値";
      instance.status.dataset.state = "boundary";
    } else {
      instance.status.textContent = "三つの目的の最大点を比較";
      instance.status.dataset.state = "resolved";
    }

    const timingText = quality.reviewTime === null
      ? `xR* = ${formatNumber(review.reviewTime)}、xJ* = ${aggregate.reviewTime === null ? `0–${DEADLINE}` : formatNumber(aggregate.reviewTime)}、xQ* の選択集合は 0–${DEADLINE} です。`
      : `xR* = ${formatNumber(review.reviewTime)}、xJ* = ${formatNumber(aggregate.reviewTime)}、xQ* = ${formatNumber(quality.reviewTime)} です。`;
    details.replaceChildren(
      htmlElement("p", undefined, timingText),
      htmlElement("p", undefined,
        `ω = ${formatNumber(state.omega)} は、中間レビュー評価へ ${formatNumber(1 - state.omega)}、最終レビュー評価へ ${formatNumber(state.omega)} の重みを与え、xJ,ω* = ${weighted.reviewTime === null ? `0–${DEADLINE}` : formatNumber(weighted.reviewTime)} を選びます。`),
    );
    drawPanel(instance, panel, state, { review, quality, aggregate: weighted }, width);
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
