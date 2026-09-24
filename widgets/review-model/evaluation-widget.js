import {
  DEADLINE, DEFAULT_WORKER, DEFAULT_MANAGER, twoReviewObjectives,
  optimalFinalizationTimeGivenIntermediate, optimalTwoReviewTimes,
} from "./model.js";
import {
  htmlElement, svgElement, formatNumber, setOutput, createWidgetRoot,
  createControls, createMetrics, createPanel, createLegend, sampleRange,
  createFrame, addPath, addVerticalLine, addCircle, mountResponsive,
} from "./widget-utils.js";

const DEFAULTS = Object.freeze({ ...DEFAULT_WORKER, ...DEFAULT_MANAGER });
const CONTROLS = Object.freeze([
  { key: "qInfinity", label: "基準品質曲線の漸近値 Q∞", min: 40, max: 100, step: 1, decimals: 0 },
  { key: "kappa", label: "品質曲線の立ち上がり κ", min: 0.05, max: 0.6, step: 0.01, decimals: 2 },
  { key: "e0", label: "初期要求水準 E₀", min: 0, max: 80, step: 1, decimals: 0 },
  { key: "beta", label: "期待上昇率 β", min: 0, max: 20, step: 0.25, decimals: 2 },
  { key: "rhoBar", label: "レビュー有効度の上限 ρ̄", min: 0, max: 1, step: 0.05, decimals: 2 },
  { key: "lambda", label: "レビュー材料の成熟速度 λ", min: 0.03, max: 1, step: 0.01, decimals: 2 },
]);

function label(frame, text, x, y, anchor = "middle") {
  const node = svgElement("text", { x: frame.xScale(x), y: frame.yScale(y),
    "text-anchor": anchor, class: "mw-axis-title" });
  node.textContent = text;
  frame.overlay.append(node);
}

/** Illustrative times define the schedule, not an optimized numerical example. */
export function renderTwoReviewTimeline() {
  const host = htmlElement("div", "mw-plots");
  const cleanups = [];
  mountResponsive(host, width => {
    const frame = createFrame({
      id: "two-review-timeline", width, height: 300,
      xDomain: [0, DEADLINE], yDomain: [0, DEADLINE],
      title: "中間レビューと最終化までの累積実作業時間",
      description: "原点から最終化まで傾き1で作業し、最終化後は水平。中間レビューで作業時間は変化しない。",
      xLabel: "実経過時間 t", yLabel: "累積実作業時間 w",
    });
    const t1 = 7, t2 = 16;
    for (const t of [t1, t2, DEADLINE]) addVerticalLine(frame, t);
    addPath(frame, [{ x: 0, y: 0 }, { x: t2, y: t2 }, { x: DEADLINE, y: t2 }], "mw-primary");
    addCircle(frame, t1, t1);
    addCircle(frame, t2, t2);
    label(frame, "t₁：中間レビュー", t1, 23);
    label(frame, "t₂：最終レビュー・最終化", t2, 20);
    label(frame, "T：締切", DEADLINE, 11, "end");
    host.replaceChildren(frame.svg);
  }, cleanups);
  host.dispose = () => cleanups.splice(0).forEach(cleanup => cleanup());
  return host;
}

// Regular display mesh only. The optimizer never reads these samples.
export function evaluationHeatmap(parameters, divisions = 60) {
  const cells = [];
  const step = DEADLINE / divisions;
  for (let i = 0; i < divisions; i++) for (let j = i; j < divisions; j++) {
    const a = i * step, b = j * step;
    const nextA = (i + 1) * step, nextB = (j + 1) * step;
    const vertices = i === j
      ? [[a, b], [a, nextB], [nextA, nextB]]
      : [[a, b], [a, nextB], [nextA, nextB], [nextA, b]];
    const t1 = vertices.reduce((sum, point) => sum + point[0], 0) / vertices.length;
    const t2 = vertices.reduce((sum, point) => sum + point[1], 0) / vertices.length;
    cells.push({ vertices, value: twoReviewObjectives(t1, t2, parameters).averageScore });
  }
  return cells;
}

function drawPanel(instance, panel, config, optimum, width) {
  const frame = createFrame({
    id: instance.id + "-evaluation", width, height: 380,
    xDomain: [0, DEADLINE], yDomain: [0, DEADLINE],
    title: "中間レビューと最終化の組合せによる総合評価",
    description: "対角線より上が実行可能領域。濃い青緑ほど平均評価が高い。曲線は条件付き最適時刻、点は決定論的探索の最良候補。",
    xLabel: "中間レビュー時刻 t₁", yLabel: "最終レビュー・最終化時刻 t₂",
  });
  const cells = evaluationHeatmap(config);
  const low = Math.min(...cells.map(cell => cell.value));
  const high = Math.max(...cells.map(cell => cell.value));
  for (const cell of cells) {
    const fraction = (cell.value - low) / (high - low || 1);
    const rgb = [236 - 228 * fraction, 247 - 121 * fraction, 247 - 108 * fraction];
    frame.background.append(svgElement("polygon", {
      points: cell.vertices.map(([x, y]) => frame.xScale(x) + "," + frame.yScale(y)).join(" "),
      fill: "rgb(" + rgb.map(Math.round).join(",") + ")",
    }));
  }
  addPath(frame, [{ x: 0, y: 0 }, { x: DEADLINE, y: DEADLINE }], "mw-muted");
  addPath(frame, [{ x: 0, y: DEADLINE }, { x: DEADLINE, y: DEADLINE }], "mw-accent");
  addPath(frame, sampleRange(DEADLINE).map(t1 => ({
    x: t1, y: optimalFinalizationTimeGivenIntermediate(t1, config).t2,
  })), "mw-secondary");
  addCircle(frame, optimum.t1, optimum.t2, "mw-point-accent", 6);
  label(frame, "t₂ < t₁：実行不能", 17, 4);
  panel.chart.replaceChildren(frame.svg);
  return "色の範囲：J = " + formatNumber(low) + "（淡色）〜 " + formatNumber(high) + "（濃色）";
}

export function renderOverallEvaluationWidget(initial = {}) {
  const defaults = { ...DEFAULTS, ...initial };
  const state = { ...defaults };
  const instance = createWidgetRoot(
    "中間レビューと最終化を同時に選ぶ",
    "中間レビュー時刻 t₁ と最終化時刻 t₂ の組合せについて、二回のレビュー評価の平均を比較します。",
  );
  const controller = new AbortController();
  const cleanups = [() => controller.abort()];
  let width = 680, render = () => {};
  createControls(instance, state, defaults, CONTROLS, () => render(), controller.signal);
  const { container, metrics } = createMetrics({
    t1: "最適中間レビュー時刻 t₁*", t2: "最適最終化時刻 t₂*",
    intermediateScore: "中間レビュー評価 S₁", finalScore: "最終レビュー評価 S₂",
    averageScore: "総合評価 J", finalQuality: "最終品質 Q₂",
    postReviewProductivity: "レビュー後の相対限界生産性 p₁⁺",
  });
  instance.root.append(container);
  const plots = htmlElement("div", "mw-plots");
  const panel = createPanel("二つの時刻と総合評価", "濃い青緑ほど総合評価 J が高い組合せです。");
  panel.panel.append(createLegend([
    ["mw-swatch-secondary", "条件付き最適化曲線 t₂*(t₁)"],
    ["mw-swatch-accent", "上辺：t₂ = T ／ 点：数値最適候補"],
    ["mw-swatch-muted", "対角線：t₂ = t₁"],
  ]));
  plots.append(panel.panel);
  const details = htmlElement("div", "mw-details");
  instance.root.append(plots, details);
  render = () => {
    const config = { ...state, deadline: DEADLINE };
    const optimum = optimalTwoReviewTimes(config);
    for (const key of Object.keys(metrics)) {
      setOutput(metrics[key].output, formatNumber(key === "t1" || key === "t2"
        ? optimum[key] : optimum.objectives[key]));
    }
    const status = {
      "immediate-finalization": "中間レビュー直後に最終化",
      "deadline-finalization": "締切で最終化", interior: "締切前に最終化（内点）",
    }[optimum.conditional.status];
    instance.status.textContent = status;
    instance.status.dataset.state = optimum.conditional.status;
    const colorText = drawPanel(instance, panel, config, optimum, width);
    details.replaceChildren(
      htmlElement("p", undefined, colorText),
      htmlElement("p", undefined,
        "点は条件付き解析解と決定論的な1次元探索による最良候補です。大域最適性の証明は付していません。表示用格子から最適点を選んでいません。"
        + (optimum.status === "tied" ? " 探索精度内で同値の候補が複数あります。" : "")
        + (optimum.status === "indifferent" ? " 評価が探索精度内で一定のため代表点を表示しています。" : "")),
    );
    instance.root.setAttribute("aria-busy", "false");
  };
  mountResponsive(plots, nextWidth => { width = nextWidth; render(); }, cleanups);
  instance.root.dispose = () => cleanups.splice(0).forEach(cleanup => cleanup());
  return instance.root;
}
