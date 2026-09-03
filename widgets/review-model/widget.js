import {
  TOTAL_TIME,
  MINIMUM_QUALITY,
  DEFAULT_WORKER,
  baselineQuality,
  qualityAtWork,
  reviewedQuality,
  baselineMarginalQuality,
  reviewedMarginalQuality,
  managerExpectation,
} from "./model.mjs";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
let nextWidgetId = 0;

// Every selector is scoped to this widget; the surrounding book owns typography.
const STYLES = `
.review-model-widget { color: inherit; font-family: inherit; min-width: 0; }
.review-model-widget * { box-sizing: border-box; }
.review-model-widget .rm-controls { display: grid; gap: .65rem; margin: .8rem 0 1rem; }
.review-model-widget .rm-control label { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .2rem .6rem; margin: 0 0 .15rem; font: inherit; font-size: .88rem; }
.review-model-widget .rm-control output { font-variant-numeric: tabular-nums; font-weight: 600; }
.review-model-widget .rm-control input { display: block; width: 100%; margin: .15rem 0; accent-color: #087e8b; }
.review-model-widget .rm-control input:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.review-model-widget .rm-chart { min-width: 0; margin: .5rem 0; }
.review-model-widget svg { display: block; width: 100%; height: auto; overflow: visible; font-family: inherit; }
.review-model-widget svg text { fill: currentColor; font-size: 11px; }
.review-model-widget .rm-axis-title { font-size: 12px; }
.review-model-widget .rm-grid { stroke: currentColor; opacity: .12; stroke-width: 1; }
.review-model-widget .rm-axis { stroke: currentColor; opacity: .55; stroke-width: 1; }
.review-model-widget .rm-line { fill: none; stroke-width: 2.5; stroke-linejoin: round; }
.review-model-widget .rm-review { stroke: #087e8b; }
.review-model-widget .rm-baseline { stroke: #707070; stroke-dasharray: 7 4; }
.review-model-widget .rm-manager-a { stroke: #087e8b; }
.review-model-widget .rm-manager-b { stroke: #b5571c; stroke-dasharray: 7 4; }
.review-model-widget .rm-marker { stroke: currentColor; opacity: .55; stroke-dasharray: 2 4; }
.review-model-widget .rm-threshold { stroke: #8d647d; stroke-dasharray: 8 3 2 3; }
.review-model-widget .rm-legend { display: flex; flex-wrap: wrap; gap: .3rem .85rem; padding: 0; margin: .45rem 0 .8rem; list-style: none; font-size: .8rem; }
.review-model-widget .rm-legend li { display: flex; align-items: center; gap: .35rem; }
.review-model-widget .rm-swatch { display: inline-block; width: 1.65rem; flex: 0 0 1.65rem; border-top: 3px solid #087e8b; }
.review-model-widget .rm-swatch.rm-baseline { border-color: #707070; border-top-style: dashed; }
.review-model-widget .rm-swatch.rm-manager-b { border-color: #b5571c; border-top-style: dashed; }
.review-model-widget .rm-swatch.rm-threshold { border-color: #8d647d; border-top-style: dotted; }
.review-model-widget .rm-summary { border-left: 3px solid #087e8b; padding: .45rem .65rem; margin: .65rem 0; background: rgba(8,126,139,.05); }
.review-model-widget .rm-summary p { margin: .25rem 0; font: inherit; font-size: .86rem; line-height: 1.55; }
.review-model-widget .rm-summary .rm-warning { font-weight: 600; }
.review-model-widget .rm-note { font: inherit; font-size: .82rem; line-height: 1.55; margin: .65rem 0 0; }
`;

function htmlElement(name, className, content) {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function svgText(parent, content, attributes) {
  const text = svgElement("text", attributes);
  text.textContent = content;
  parent.append(text);
  return text;
}

function format(value, decimals = 1) {
  return value.toFixed(decimals).replace(/\.0$/, "");
}

function createPanel(name) {
  const root = htmlElement("div", "review-model-widget");
  const id = `review-model-${++nextWidgetId}`;
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", name);
  const style = htmlElement("style");
  style.textContent = STYLES;
  const controls = htmlElement("div", "rm-controls");
  const chart = htmlElement("div", "rm-chart");
  const legend = htmlElement("ul", "rm-legend");
  legend.setAttribute("aria-label", "グラフの凡例");
  const summary = htmlElement("div", "rm-summary");
  summary.setAttribute("aria-live", "polite");
  summary.setAttribute("aria-atomic", "true");
  root.append(style, controls, chart, legend, summary);
  return { root, id, controls, chart, legend, summary };
}

function addSlider(panel, { key, label, min, max, step, value, decimals = 1 }, onChange) {
  const container = htmlElement("div", "rm-control");
  const labelElement = htmlElement("label");
  const labelText = htmlElement("span", undefined, label);
  const output = htmlElement("output", undefined, format(value, decimals));
  const input = htmlElement("input");
  input.id = `${panel.id}-${key}`;
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  labelElement.htmlFor = input.id;
  output.htmlFor = input.id;
  labelElement.append(labelText, output);
  input.addEventListener("input", () => {
    output.value = format(input.valueAsNumber, decimals);
    onChange(input.valueAsNumber);
  });
  container.append(labelElement, input);
  panel.controls.append(container);
}

function addLegend(panel, entries) {
  for (const [className, label] of entries) {
    const item = htmlElement("li");
    const swatch = htmlElement("span", `rm-swatch ${className}`);
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, document.createTextNode(label));
    panel.legend.append(item);
  }
}

function setSummary(panel, rows) {
  panel.summary.replaceChildren(...rows.map(({ text, warning }) =>
    htmlElement("p", warning ? "rm-warning" : undefined, text)));
}

function chartFrame(panel, { width, maximum, title, description, xLabel, yLabel }) {
  // Use the measured container width so 11px tick labels remain readable in a
  // narrow column, rather than shrinking a fixed desktop-size SVG viewBox.
  const height = width < 360 ? 252 : 272;
  const margin = { top: 31, right: 16, bottom: 49, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xScale = value => margin.left + value / TOTAL_TIME * innerWidth;
  const yScale = value => margin.top + (1 - value / maximum) * innerHeight;
  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-labelledby": `${panel.id}-title ${panel.id}-desc`,
  });
  const titleNode = svgElement("title", { id: `${panel.id}-title` });
  titleNode.textContent = title;
  const descriptionNode = svgElement("desc", { id: `${panel.id}-desc` });
  descriptionNode.textContent = description;
  svg.append(titleNode, descriptionNode);
  for (const tick of [0, 5, 10, 15, 20, 25]) {
    svg.append(svgElement("line", { x1: xScale(tick), x2: xScale(tick),
      y1: margin.top, y2: yScale(0), class: "rm-grid" }));
    svgText(svg, tick, { x: xScale(tick), y: yScale(0) + 19, "text-anchor": "middle" });
  }
  for (let index = 0; index <= 4; index++) {
    const tick = maximum * index / 4;
    svg.append(svgElement("line", { x1: xScale(0), x2: xScale(TOTAL_TIME),
      y1: yScale(tick), y2: yScale(tick), class: "rm-grid" }));
    svgText(svg, format(tick), { x: margin.left - 7, y: yScale(tick) + 4, "text-anchor": "end" });
  }
  svg.append(svgElement("path", { d: `M${xScale(0)},${yScale(maximum)} V${yScale(0)} H${xScale(TOTAL_TIME)}`,
    fill: "none", class: "rm-axis" }));
  svg.append(svgElement("line", { x1: xScale(0), x2: xScale(TOTAL_TIME),
    y1: yScale(MINIMUM_QUALITY), y2: yScale(MINIMUM_QUALITY), class: "rm-threshold" }));
  svgText(svg, yLabel, { x: margin.left, y: 16, class: "rm-axis-title" });
  svgText(svg, xLabel, { x: width / 2, y: height - 8, "text-anchor": "middle", class: "rm-axis-title" });
  return { svg, xScale, yScale, maximum };
}

function addCurve(frame, quality, className) {
  const data = Array.from({ length: 201 }, (_, index) => {
    const work = TOTAL_TIME * index / 200;
    return `${index === 0 ? "M" : "L"}${frame.xScale(work).toFixed(2)},${frame.yScale(quality(work)).toFixed(2)}`;
  }).join(" ");
  frame.svg.append(svgElement("path", { d: data, class: `rm-line ${className}` }));
}

function addTimeMarker(frame, time) {
  frame.svg.append(svgElement("line", { x1: frame.xScale(time), x2: frame.xScale(time),
    y1: frame.yScale(0), y2: frame.yScale(frame.maximum), class: "rm-marker" }));
}

function addPoint(frame, time, value, color, square = false) {
  frame.svg.append(square
    ? svgElement("rect", { x: frame.xScale(time) - 4, y: frame.yScale(value) - 4, width: 8, height: 8, fill: color })
    : svgElement("circle", { cx: frame.xScale(time), cy: frame.yScale(value), r: 4.5, fill: color }));
}

function responsiveDrawing(panel, draw) {
  let previousWidth = 0;
  const redraw = () => {
    const measured = panel.chart.getBoundingClientRect().width;
    const width = Math.max(180, Math.round(measured || 360));
    previousWidth = width;
    draw(width);
  };
  let observer;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(entries => {
      const width = Math.max(180, Math.round(entries[0].contentRect.width || 360));
      if (width !== previousWidth) redraw();
    });
    observer.observe(panel.chart);
  } else {
    window.addEventListener("resize", redraw);
  }
  panel.root.dispose = () => {
    observer?.disconnect();
    window.removeEventListener("resize", redraw);
  };
  redraw();
  return redraw;
}

/** Return a self-contained, browser-only worker-model panel for a Quarto OJS cell. */
export function renderWorkerModel() {
  const panel = createPanel("作業者モデルのパラメータと品質曲線");
  const state = { ...DEFAULT_WORKER, reviewWork: 6 };
  let redraw = () => {};
  for (const control of [
    { key: "qbar", label: "レビューなしの品質上限 q̄", min: 20, max: 100, step: 1, value: 80, decimals: 0 },
    { key: "k", label: "基礎的な改善速度 k", min: 0.05, max: 1, step: 0.01, value: 0.25, decimals: 2 },
    { key: "h", label: "レビューの成熟尺度 h", min: 0.5, max: 15, step: 0.5, value: 4 },
    { key: "reviewWork", label: "レビューまでの実作業 x", min: 0.5, max: 24.5, step: 0.5, value: 6 },
  ]) {
    addSlider(panel, control, value => { state[control.key] = value; redraw(); });
  }
  addLegend(panel, [["rm-review", "レビューあり（実線）"], ["rm-baseline", "レビューなし（破線）"],
    ["rm-threshold", "最低品質 100"]]);
  panel.root.append(htmlElement("p", "rm-note",
    "横軸は1タスクに投入する累積実作業 s です。縦の点線と丸印はレビューまでの実作業量 x を示します。総作業25の配分例であり、複数タスクの実行可能な日程や最適解を示すものではありません。数値は説明用の仮定です。"));

  redraw = responsiveDrawing(panel, width => {
    const reviewQuality = baselineQuality(state.reviewWork, state);
    const finalQuality = reviewedQuality(state.reviewWork, TOTAL_TIME - state.reviewWork, state);
    const beforeSlope = baselineMarginalQuality(state.reviewWork, state);
    const afterSlope = reviewedMarginalQuality(state.reviewWork, 0, state);
    const description = `累積実作業0から25。レビュー位置${format(state.reviewWork)}、レビュー時の品質${format(reviewQuality)}、総作業25での品質${format(finalQuality)}。レビュー時に品質は連続し、その直後の改善速度が上がります。`;
    const frame = chartFrame(panel, { width, maximum: Math.max(120, Math.ceil(finalQuality / 20) * 20),
      title: "レビュー前後の品質曲線", description, xLabel: "累積実作業 s", yLabel: "品質" });
    addCurve(frame, work => baselineQuality(work, state), "rm-baseline");
    addCurve(frame, work => qualityAtWork(work, state.reviewWork, state), "rm-review");
    addTimeMarker(frame, state.reviewWork);
    addPoint(frame, state.reviewWork, reviewQuality, "#087e8b");
    panel.chart.replaceChildren(frame.svg);
    const rows = [
      { text: `レビュー時：約${format(reviewQuality)} ／ 総作業25での品質：約${format(finalQuality)}` },
      { text: `レビュー直前・直後の改善速度：${format(beforeSlope, 2)} → ${format(afterSlope, 2)}（品質／作業時間）。品質自体は跳びません。` },
    ];
    if (state.qbar <= 50) {
      rows.push({ text: "q̄ ≤ 50 では、有限の作業時間で Q < 2q̄ ≤ 100 となるため、どの配分でも最低品質を達成できません。", warning: true });
    } else if (finalQuality < MINIMUM_QUALITY) {
      rows.push({ text: "この配分では最低品質100に未達です（判定は丸め前の値）。別の配分でも達成不能かどうかは、この表示だけでは判断できません。", warning: true });
    } else {
      rows.push({ text: "この1タスクへの配分では最低品質100に到達しています。複数タスク全体の実行可能性は別途確認が必要です。" });
    }
    setSummary(panel, rows);
  });
  return panel.root;
}

/** Return a self-contained panel comparing two managers' calendar-time expectations. */
export function renderManagerModel() {
  const panel = createPanel("マネージャーモデルのパラメータと期待品質");
  const state = { aA: 20, bA: 3, aB: 45, bB: 1.5, time: 10 };
  let redraw = () => {};
  for (const control of [
    { key: "aA", label: "A：初期期待値 a", min: 0, max: 100, step: 1, value: 20, decimals: 0 },
    { key: "bA", label: "A：期待上昇率 b", min: 0, max: 6, step: 0.1, value: 3 },
    { key: "aB", label: "B：初期期待値 a", min: 0, max: 100, step: 1, value: 45, decimals: 0 },
    { key: "bB", label: "B：期待上昇率 b", min: 0, max: 6, step: 0.1, value: 1.5 },
    { key: "time", label: "値を読むカレンダー時刻 t", min: 0, max: 25, step: 0.5, value: 10 },
  ]) {
    addSlider(panel, control, value => { state[control.key] = value; redraw(); });
  }
  addLegend(panel, [["rm-manager-a", "A：実線・丸印"], ["rm-manager-b", "B：破線・四角印"],
    ["rm-threshold", "最低品質 100（参照線）"]]);
  panel.root.append(htmlElement("p", "rm-note",
    "a は直線を上下に動かし、b は傾きを変えます。横軸はカレンダー時刻 t であり、タスクの実作業時間ではありません。作業していない間も期待品質は時間とともに変化します。数値は説明用で、推定値や最適な順序ではありません。"));

  redraw = responsiveDrawing(panel, width => {
    const managerA = { a: state.aA, b: state.bA };
    const managerB = { a: state.aB, b: state.bB };
    const expectedA = managerExpectation(state.time, managerA);
    const expectedB = managerExpectation(state.time, managerB);
    const maximum = Math.max(120, Math.ceil(Math.max(managerExpectation(TOTAL_TIME, managerA),
      managerExpectation(TOTAL_TIME, managerB)) / 20) * 20);
    const description = `カレンダー時刻0から25。Aの期待値は${state.aA}+${state.bA}t、Bは${state.aB}+${state.bB}t。時刻${format(state.time)}でAは${format(expectedA)}、Bは${format(expectedB)}。`;
    const frame = chartFrame(panel, { width, maximum, title: "2人のマネージャーの期待品質",
      description, xLabel: "カレンダー時刻 t", yLabel: "期待品質 e(t)" });
    addCurve(frame, time => managerExpectation(time, managerA), "rm-manager-a");
    addCurve(frame, time => managerExpectation(time, managerB), "rm-manager-b");
    addTimeMarker(frame, state.time);
    addPoint(frame, state.time, expectedA, "#087e8b");
    addPoint(frame, state.time, expectedB, "#b5571c", true);
    panel.chart.replaceChildren(frame.svg);
    setSummary(panel, [
      { text: `t = ${format(state.time)}：A の期待品質 ${format(expectedA)} ／ B の期待品質 ${format(expectedB)}` },
      { text: `A：e(t) = ${format(state.aA)} + ${format(state.bA)}t　B：e(t) = ${format(state.aB)} + ${format(state.bB)}t` },
      { text: "この評価式では、a を増やすと評価水準は一律に下がりますが、同じタスクの候補日程どうしの優劣は変わりません。" },
    ]);
  });
  return panel.root;
}
