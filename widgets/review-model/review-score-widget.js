import {
  DEADLINE,
  DEFAULT_WORKER,
  DEFAULT_MANAGER,
  phi,
  phiPrime,
  expectation,
  reviewScoreAtTime,
  optimalReviewScoreTime,
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
  addBoundaryTriangle,
  mountResponsive,
} from "./widget-utils.js";

const DEFAULTS = Object.freeze({
  qInfinity: DEFAULT_WORKER.qInfinity,
  kappa: DEFAULT_WORKER.kappa,
  e0: DEFAULT_MANAGER.e0,
  beta: DEFAULT_MANAGER.beta,
});

const CONTROLS = Object.freeze([
  { key: "qInfinity", label: "品質上限 Q∞", min: 40, max: 100, step: 1, decimals: 0 },
  { key: "kappa", label: "品質改善速度 κ", min: 0.05, max: 0.6, step: 0.01, decimals: 2 },
  { key: "e0", label: "初期要求水準 E₀", min: 0, max: 80, step: 1, decimals: 0 },
  { key: "beta", label: "期待上昇率 β", min: 0, max: 20, step: 0.25, decimals: 2 },
]);

const STATUS_LABELS = Object.freeze({
  interior: "内点解：限界量が一致",
  "early-boundary": "最早境界：τ = 0",
  "deadline-boundary": `期限境界：τ = ${DEADLINE}`,
});

function parameters(state) {
  return {
    worker: { qInfinity: state.qInfinity, kappa: state.kappa },
    manager: { e0: state.e0, beta: state.beta },
    deadline: DEADLINE,
  };
}

function drawPanels(instance, panels, state, result, width) {
  const times = sampleRange(DEADLINE);
  const worker = { qInfinity: state.qInfinity, kappa: state.kappa };
  const manager = { e0: state.e0, beta: state.beta };
  const quality = times.map(x => ({ x, y: phi(x, worker) }));
  const expected = times.map(x => ({ x, y: expectation(x, manager) }));
  const marginal = times.map(x => ({ x, y: phiPrime(x, worker) }));
  const slope = times.map(x => ({ x, y: state.beta }));
  const score = times.map(x => ({ x, y: reviewScoreAtTime(x, parameters(state)) }));

  const levelFrame = createFrame({
    id: `${instance.id}-levels`,
    width,
    xDomain: [0, DEADLINE],
    yDomain: paddedDomain([...quality, ...expected].map(point => point.y), { nonnegative: true }),
    title: "品質とマネージャー期待",
    description: `時刻0から${DEADLINE}までの基準品質と期待品質。最適レビュー時刻は${formatNumber(result.reviewTime)}。`,
    xLabel: "カレンダー時刻 t",
    yLabel: "品質・期待",
  });
  addPath(levelFrame, quality, "mw-primary");
  addPath(levelFrame, expected, "mw-accent");
  addVerticalLine(levelFrame, result.reviewTime);
  addCircle(levelFrame, result.reviewTime, phi(result.reviewTime, worker));
  panels.levels.chart.replaceChildren(levelFrame.svg);

  const marginalFrame = createFrame({
    id: `${instance.id}-marginal`,
    width,
    xDomain: [0, DEADLINE],
    yDomain: paddedDomain([...marginal, ...slope].map(point => point.y), { nonnegative: true }),
    title: "限界品質改善と期待上昇率",
    description: `限界品質改善と期待上昇率を比較する。選択時刻は${formatNumber(result.reviewTime)}。`,
    xLabel: "カレンダー時刻 t",
    yLabel: "限界量",
  });
  addPath(marginalFrame, marginal, "mw-primary");
  addPath(marginalFrame, slope, "mw-secondary");
  addVerticalLine(marginalFrame, result.reviewTime);
  addCircle(marginalFrame, result.reviewTime, result.marginalQuality);
  panels.marginal.chart.replaceChildren(marginalFrame.svg);

  const scoreFrame = createFrame({
    id: `${instance.id}-score`,
    width,
    xDomain: [0, DEADLINE],
    yDomain: paddedDomain(score.map(point => point.y)),
    title: "レビュー時評価",
    description: `レビュー時評価Sの最大点は${formatNumber(result.reviewTime)}。`,
    xLabel: "レビュー時刻 τ",
    yLabel: "S(τ)",
  });
  addPath(scoreFrame, score, "mw-primary");
  addVerticalLine(scoreFrame, result.reviewTime);
  if (result.status === "interior") {
    addCircle(scoreFrame, result.reviewTime, result.score);
  } else {
    addBoundaryTriangle(scoreFrame, result.reviewTime, result.score);
  }
  panels.score.chart.replaceChildren(scoreFrame.svg);
}

export function renderReviewScoreWidget(initial = {}) {
  const defaults = { ...DEFAULTS, ...initial };
  const state = { ...defaults };
  const instance = createWidgetRoot(
    "レビュー時評価の最大化",
    `T = ${DEADLINE} のもとで、品質改善の限界量と期待上昇率を比較します。`,
  );
  const controller = new AbortController();
  const cleanups = [() => controller.abort()];
  let width = 680;
  let render = () => {};

  createControls(instance, state, defaults, CONTROLS, () => render(), controller.signal);
  const { container: metricContainer, metrics } = createMetrics({
    reviewTime: "最適レビュー時刻 τR*",
    marginalQuality: "限界品質改善 Φ′(τR*)",
    expectationSlope: "期待上昇率 β",
    score: "レビュー時評価 S(τR*)",
  });
  instance.root.append(metricContainer);

  const plots = htmlElement("div", "mw-plots");
  const panels = {
    levels: createPanel("A｜品質と期待", "二曲線の値の差が、その時刻のレビュー評価です。"),
    marginal: createPanel("B｜限界量", "Φ′(t) と β の一致が内点条件を表します。"),
    score: createPanel("C｜レビュー時評価", "限界量の一致点が S(t) の頂点へ対応します。"),
  };
  panels.levels.panel.append(createLegend([
    ["mw-swatch-primary", "基準品質 Φ(t)"],
    ["mw-swatch-accent", "期待品質 E(t)"],
    ["mw-swatch-secondary", "最適レビュー時刻"],
  ]));
  panels.marginal.panel.append(createLegend([
    ["mw-swatch-primary", "限界品質改善 Φ′(t)"],
    ["mw-swatch-secondary", "期待上昇率 β"],
  ]));
  panels.score.panel.append(createLegend([
    ["mw-swatch-primary", "レビュー時評価 S(t)"],
    ["mw-swatch-secondary", "最大点"],
  ]));
  plots.append(panels.levels.panel, panels.marginal.panel, panels.score.panel);
  const details = htmlElement("div", "mw-details");
  instance.root.append(plots, details);

  render = () => {
    const result = optimalReviewScoreTime(parameters(state));
    setOutput(metrics.reviewTime.output, formatNumber(result.reviewTime));
    setOutput(metrics.marginalQuality.output, formatNumber(result.marginalQuality));
    setOutput(metrics.expectationSlope.output, formatNumber(result.expectationSlope));
    setOutput(metrics.score.output, formatNumber(result.score));
    instance.status.textContent = STATUS_LABELS[result.status];
    instance.status.dataset.state = result.status;
    details.replaceChildren(
      htmlElement("p", undefined,
        `現在の設定では τR* = ${formatNumber(result.reviewTime)}、Φ′(τR*) = ${formatNumber(result.marginalQuality)}、β = ${formatNumber(result.expectationSlope)} です。`),
      htmlElement("p", undefined,
        `E₀ = ${formatNumber(state.e0)} は評価曲線の高さを決め、傾き β が停止時刻へ作用します。`),
    );
    drawPanels(instance, panels, state, result, width);
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
