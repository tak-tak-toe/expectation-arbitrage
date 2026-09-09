import {
  MINIMUM_QUALITY,
  DEFAULT_WORKER,
  baselineQuality,
  qualityAtWork,
  reviewedQuality,
  baselineMarginalQuality,
  reviewedMarginalQuality,
  managerExpectation,
} from "./model.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DEFAULT_DISPLAY_HORIZON = 25;
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
.review-model-widget .rm-manager { stroke: #087e8b; }
.review-model-widget .rm-marker { stroke: currentColor; opacity: .55; stroke-dasharray: 2 4; }
.review-model-widget .rm-threshold { stroke: #8d647d; stroke-dasharray: 8 3 2 3; }
.review-model-widget .rm-legend { display: flex; flex-wrap: wrap; gap: .3rem .85rem; padding: 0; margin: .45rem 0 .8rem; list-style: none; font-size: .8rem; }
.review-model-widget .rm-legend li { display: flex; align-items: center; gap: .35rem; }
.review-model-widget .rm-swatch { display: inline-block; width: 1.65rem; flex: 0 0 1.65rem; border-top: 3px solid #087e8b; }
.review-model-widget .rm-swatch.rm-baseline { border-color: #707070; border-top-style: dashed; }
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
  return { input, output, decimals };
}

function syncSlider(slider, { value, maximum }) {
  if (maximum !== undefined) slider.input.max = String(maximum);
  slider.input.value = String(value);
  slider.output.value = format(slider.input.valueAsNumber, slider.decimals);
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

function horizontalTicks(horizon, innerWidth) {
  const rawStep = horizon / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  const ticks = [];
  for (let tick = 0; tick <= horizon + step * 1e-9; tick += step) {
    ticks.push(Number(tick.toPrecision(12)));
  }
  if (ticks.at(-1) !== horizon) {
    const gapPixels = (horizon - ticks.at(-1)) / horizon * innerWidth;
    if (gapPixels < 28 && ticks.length > 1) ticks.pop();
    ticks.push(horizon);
  }
  return ticks;
}

function chartFrame(panel, { width, horizon, maximum, title, description, xLabel, yLabel }) {
  // Use the measured container width so 11px tick labels remain readable in a
  // narrow column, rather than shrinking a fixed desktop-size SVG viewBox.
  const height = width < 360 ? 252 : 272;
  const margin = { top: 31, right: 16, bottom: 49, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xScale = value => margin.left + value / horizon * innerWidth;
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
  for (const tick of horizontalTicks(horizon, innerWidth)) {
    svg.append(svgElement("line", { x1: xScale(tick), x2: xScale(tick),
      y1: margin.top, y2: yScale(0), class: "rm-grid" }));
    svgText(svg, tick, { x: xScale(tick), y: yScale(0) + 19, "text-anchor": "middle" });
  }
  for (let index = 0; index <= 4; index++) {
    const tick = maximum * index / 4;
    svg.append(svgElement("line", { x1: xScale(0), x2: xScale(horizon),
      y1: yScale(tick), y2: yScale(tick), class: "rm-grid" }));
    svgText(svg, format(tick), { x: margin.left - 7, y: yScale(tick) + 4, "text-anchor": "end" });
  }
  svg.append(svgElement("path", { d: `M${xScale(0)},${yScale(maximum)} V${yScale(0)} H${xScale(horizon)}`,
    fill: "none", class: "rm-axis" }));
  svg.append(svgElement("line", { x1: xScale(0), x2: xScale(horizon),
    y1: yScale(MINIMUM_QUALITY), y2: yScale(MINIMUM_QUALITY), class: "rm-threshold" }));
  svgText(svg, yLabel, { x: margin.left, y: 16, class: "rm-axis-title" });
  svgText(svg, xLabel, { x: width / 2, y: height - 8, "text-anchor": "middle", class: "rm-axis-title" });
  return { svg, xScale, yScale, maximum };
}

function addCurve(frame, horizon, quality, className) {
  const data = Array.from({ length: 201 }, (_, index) => {
    const work = horizon * index / 200;
    return `${index === 0 ? "M" : "L"}${frame.xScale(work).toFixed(2)},${frame.yScale(quality(work)).toFixed(2)}`;
  }).join(" ");
  frame.svg.append(svgElement("path", { d: data, class: `rm-line ${className}` }));
}

function addTimeMarker(frame, time) {
  frame.svg.append(svgElement("line", { x1: frame.xScale(time), x2: frame.xScale(time),
    y1: frame.yScale(0), y2: frame.yScale(frame.maximum), class: "rm-marker" }));
}

function addPoint(frame, time, value, color) {
  frame.svg.append(svgElement("circle", {
    cx: frame.xScale(time),
    cy: frame.yScale(value),
    r: 4.5,
    fill: color,
  }));
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
  const state = { ...DEFAULT_WORKER, totalWork: DEFAULT_DISPLAY_HORIZON, reviewWork: 6 };
  let redraw = () => {};
  let reviewWorkSlider;
  addSlider(panel,
    { key: "totalWork", label: "表示する総実作業 W", min: 5, max: 50, step: 1,
      value: DEFAULT_DISPLAY_HORIZON, decimals: 0 },
    value => {
      state.totalWork = value;
      const maximum = value - 0.5;
      state.reviewWork = Math.min(state.reviewWork, maximum);
      syncSlider(reviewWorkSlider, { value: state.reviewWork, maximum });
      redraw();
    });
  for (const control of [
    { key: "qbar", label: "基準品質の上限 q̄", min: 20, max: 100, step: 1,
      value: 80, decimals: 0 },
    { key: "k", label: "基礎的な改善速度 k", min: 0.05, max: 1, step: 0.01,
      value: 0.25, decimals: 2 },
    { key: "h", label: "レビューの成熟尺度 h", min: 0.5, max: 15, step: 0.5,
      value: 4 },
  ]) {
    addSlider(panel, control, value => { state[control.key] = value; redraw(); });
  }
  reviewWorkSlider = addSlider(panel,
    { key: "reviewWork", label: "レビューまでの実作業 x", min: 0.5,
      max: state.totalWork - 0.5, step: 0.5, value: 6 },
    value => { state.reviewWork = value; redraw(); });
  addLegend(panel, [["rm-review", "レビュー適用曲線（実線）"], ["rm-baseline", "基準品質曲線 q₀（破線）"],
    ["rm-threshold", "最低品質 100"]]);
  panel.root.append(htmlElement("p", "rm-note",
    "横軸は1つのタスクに投入する累積実作業 s です。総実作業 W は表示範囲の終点、縦の点線と丸印はレビューまでの実作業量 x を示します。W は累積実作業量、T はカレンダー上の期限を表します。初期表示は W=25、q̄=80、k=0.25、h=4、x=6 です。"));

  redraw = responsiveDrawing(panel, width => {
    const reviewQuality = baselineQuality(state.reviewWork, state);
    const finalQuality = reviewedQuality(state.reviewWork,
      state.totalWork - state.reviewWork, state);
    const beforeSlope = baselineMarginalQuality(state.reviewWork, state);
    const afterSlope = reviewedMarginalQuality(state.reviewWork, 0, state);
    const description = `累積実作業0から${format(state.totalWork)}。レビュー位置${format(state.reviewWork)}、レビュー時の品質${format(reviewQuality)}、総実作業${format(state.totalWork)}での品質${format(finalQuality)}。レビュー時に品質は連続し、その直後の改善速度が上がります。`;
    const frame = chartFrame(panel, { width, horizon: state.totalWork,
      maximum: Math.max(120, Math.ceil(finalQuality / 20) * 20),
      title: "レビュー前後の品質曲線", description, xLabel: "累積実作業 s", yLabel: "品質" });
    addCurve(frame, state.totalWork, work => baselineQuality(work, state), "rm-baseline");
    addCurve(frame, state.totalWork,
      work => qualityAtWork(work, state.reviewWork, state), "rm-review");
    addTimeMarker(frame, state.reviewWork);
    addPoint(frame, state.reviewWork, reviewQuality, "#087e8b");
    panel.chart.replaceChildren(frame.svg);
    const rows = [
      { text: `レビュー時：約${format(reviewQuality)} ／ 総実作業 W = ${format(state.totalWork)} での品質：約${format(finalQuality)}` },
      { text: `レビュー直前・直後の改善速度：${format(beforeSlope, 2)} → ${format(afterSlope, 2)}（品質／作業時間）。品質はレビュー時点で連続です。` },
    ];
    if (state.qbar <= 50) {
      rows.push({ text: "q̄ ≤ 50 では、有限の作業時間における品質が Q < 2q̄ ≤ 100 の範囲に入ります。最低品質100の必要条件は q̄ > 50 です。", warning: true });
    } else if (finalQuality < MINIMUM_QUALITY) {
      rows.push({ text: `現在の選択値では、最低品質100までの品質差が約${format(MINIMUM_QUALITY - finalQuality)}です（丸め前の値による判定）。`, warning: true });
    } else {
      rows.push({ text: `このレビュー時点では、総実作業 W = ${format(state.totalWork)} で最低品質100に到達しています。` });
    }
    setSummary(panel, rows);
  });
  return panel.root;
}

/** Return a self-contained panel for one manager's calendar-time expectation. */
export function renderManagerModel() {
  const panel = createPanel("マネージャーモデルのパラメータと期待品質");
  const state = { a: 20, b: 3, deadline: DEFAULT_DISPLAY_HORIZON, time: 10 };
  let redraw = () => {};
  let timeSlider;
  addSlider(panel,
    { key: "deadline", label: "表示するカレンダー期限 T", min: 5, max: 50, step: 1,
      value: DEFAULT_DISPLAY_HORIZON, decimals: 0 },
    value => {
      state.deadline = value;
      state.time = Math.min(state.time, value);
      syncSlider(timeSlider, { value: state.time, maximum: value });
      redraw();
    });
  for (const control of [
    { key: "a", label: "初期期待値 a", min: 0, max: 100, step: 1, value: 20, decimals: 0 },
    { key: "b", label: "期待上昇率 b", min: 0, max: 6, step: 0.1, value: 3 },
  ]) {
    addSlider(panel, control, value => { state[control.key] = value; redraw(); });
  }
  timeSlider = addSlider(panel,
    { key: "time", label: "値を読むカレンダー時刻 t", min: 0, max: state.deadline,
      step: 0.5, value: 10 },
    value => { state.time = value; redraw(); });
  addLegend(panel, [["rm-manager", "期待品質 e(t)（実線・丸印）"],
    ["rm-threshold", "最低品質 100（参照線）"]]);
  panel.root.append(htmlElement("p", "rm-note",
    "a は時刻0の期待品質であり、直線を上下に動かします。b はカレンダー時刻1単位あたりの期待品質の増加量であり、直線の傾きを変えます。横軸はカレンダー時刻 t、T は表示範囲の期限を表します。累積実作業 W は作業者グラフの横軸に対応します。作業休止中も期待品質は時間とともに変化します。初期表示は a=20、b=3、T=25、t=10 です。"));

  redraw = responsiveDrawing(panel, width => {
    const manager = { a: state.a, b: state.b };
    const expected = managerExpectation(state.time, manager);
    const maximum = Math.max(120,
      Math.ceil(managerExpectation(state.deadline, manager) / 20) * 20);
    const description = `カレンダー時刻0から${format(state.deadline)}。マネージャーの期待品質は${state.a}+${state.b}t。時刻${format(state.time)}での期待品質は${format(expected)}。`;
    const frame = chartFrame(panel, { width, horizon: state.deadline, maximum,
      title: "マネージャーの期待品質",
      description, xLabel: "カレンダー時刻 t", yLabel: "期待品質 e(t)" });
    addCurve(frame, state.deadline,
      time => managerExpectation(time, manager), "rm-manager");
    addTimeMarker(frame, state.time);
    addPoint(frame, state.time, expected, "#087e8b");
    panel.chart.replaceChildren(frame.svg);
    setSummary(panel, [
      { text: `t = ${format(state.time)} での期待品質：約${format(expected)}` },
      { text: `e(t) = ${format(state.a)} + ${format(state.b)}t` },
    ]);
  });
  return panel.root;
}
