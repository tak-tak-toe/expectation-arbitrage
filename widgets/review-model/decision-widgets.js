import {
  DEADLINE,
  MINIMUM_QUALITY,
  DEFAULT_WORKER,
  DEFAULT_MANAGER,
  DEFAULT_FIXED_WORK,
  baselineQuality,
  baselineMarginalQuality,
  managerExpectation,
  reviewedQuality,
  localReviewEvaluation,
  localOptimalReviewTime,
  fullEvaluationAtReviewTime,
  optimalReviewTimeForFixedWork,
} from "./model.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const REDRAW_DELAY = 70;
const SLOPE_DEFAULTS = Object.freeze({
  qbar: DEFAULT_WORKER.qbar,
  k: DEFAULT_WORKER.k,
  a: DEFAULT_MANAGER.a,
  b: 1,
});
let nextWidgetId = 0;

const STYLES = `
.decision-widget {
  --dm-primary: #087e8b;
  --dm-secondary: #b5571c;
  --dm-accent: #8d647d;
  --dm-muted: #707780;
  --dm-border: rgba(8, 126, 139, .28);
  --dm-surface: rgba(8, 126, 139, .055);
  color: inherit;
  container-type: inline-size;
  font-family: inherit;
  min-width: 0;
}
.decision-widget * { box-sizing: border-box; }
.decision-widget .dm-header { display: grid; gap: .4rem; margin: 0 0 .85rem; }
.decision-widget .dm-title { margin: 0; font-size: 1.08rem; font-weight: 700; line-height: 1.35; }
.decision-widget .dm-intro,
.decision-widget .dm-note { margin: 0; font-size: .84rem; line-height: 1.55; }
.decision-widget .dm-status {
  justify-self: start;
  margin: .1rem 0 0;
  padding: .22rem .55rem;
  border: 1px solid var(--dm-border);
  border-radius: 999px;
  background: var(--dm-surface);
  font-size: .78rem;
  font-weight: 650;
  line-height: 1.35;
}
.decision-widget .dm-status[data-state="interior"],
.decision-widget .dm-status[data-state="feasible"] { border-color: var(--dm-primary); }
.decision-widget .dm-status[data-state="boundary"] { border-color: var(--dm-secondary); }
.decision-widget .dm-status[data-state="outside"] { border-color: var(--dm-accent); }
.decision-widget .dm-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11.5rem), 1fr));
  gap: .55rem .8rem;
  margin: 0 0 .85rem;
  padding: .75rem;
  border: 1px solid var(--dm-border);
  border-radius: .4rem;
  background: var(--dm-surface);
}
.decision-widget .dm-controls legend { padding: 0 .25rem; font-size: .88rem; font-weight: 700; }
.decision-widget .dm-control { min-width: 0; }
.decision-widget .dm-control label {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: .2rem .55rem;
  margin: 0 0 .12rem;
  font-size: .8rem;
  line-height: 1.4;
}
.decision-widget .dm-control output { font-variant-numeric: tabular-nums; font-weight: 700; }
.decision-widget .dm-control input[type="range"] {
  display: block;
  width: 100%;
  margin: .18rem 0 .05rem;
  accent-color: var(--dm-primary);
}
.decision-widget .dm-control input[type="range"]:focus-visible,
.decision-widget .dm-reset:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.decision-widget .dm-range { color: var(--dm-muted); font-size: .69rem; }
.decision-widget .dm-actions { display: flex; justify-content: flex-end; margin: -.35rem 0 .75rem; }
.decision-widget .dm-reset {
  border: 1px solid var(--dm-border);
  border-radius: .35rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: .76rem;
  padding: .35rem .62rem;
}
.decision-widget .dm-reset:hover { background: var(--dm-surface); }
.decision-widget .dm-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr));
  gap: .55rem;
  margin: 0 0 .9rem;
}
.decision-widget .dm-metric {
  min-width: 0;
  padding: .65rem;
  border: 1px solid var(--dm-border);
  border-radius: .35rem;
  background: var(--dm-surface);
}
.decision-widget .dm-metric-label { margin: 0 0 .16rem; font-size: .73rem; line-height: 1.35; }
.decision-widget .dm-metric-value {
  display: block;
  margin: 0;
  font-size: 1.14rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.decision-widget .dm-plots { display: grid; gap: .9rem; min-width: 0; }
.decision-widget .dm-panel {
  min-width: 0;
  margin: 0;
  padding: .55rem .55rem .45rem;
  border: 1px solid var(--dm-border);
  border-radius: .38rem;
}
.decision-widget .dm-panel-title { margin: 0 0 .2rem; font-size: .84rem; font-weight: 700; line-height: 1.4; }
.decision-widget .dm-panel-note { margin: 0 0 .25rem; font-size: .74rem; line-height: 1.45; }
.decision-widget .dm-chart { min-width: 0; }
.decision-widget svg { display: block; width: 100%; height: auto; overflow: visible; font-family: inherit; }
.decision-widget svg text { fill: currentColor; font-size: 11px; }
.decision-widget svg .dm-axis-title { font-size: 12px; font-weight: 600; }
.decision-widget .dm-grid { stroke: currentColor; stroke-width: 1; opacity: .12; }
.decision-widget .dm-axis { fill: none; stroke: currentColor; stroke-width: 1; opacity: .58; }
.decision-widget .dm-zero { stroke: currentColor; stroke-width: 1.2; opacity: .32; }
.decision-widget .dm-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.45; vector-effect: non-scaling-stroke; }
.decision-widget .dm-quality { stroke: var(--dm-primary); }
.decision-widget .dm-expectation { stroke: var(--dm-accent); stroke-dasharray: 7 4; }
.decision-widget .dm-marginal { stroke: var(--dm-primary); }
.decision-widget .dm-slope { stroke: var(--dm-secondary); stroke-dasharray: 7 4; }
.decision-widget .dm-evaluation { stroke: var(--dm-primary); }
.decision-widget .dm-all-evaluation { stroke: var(--dm-muted); stroke-dasharray: 5 4; opacity: .72; }
.decision-widget .dm-feasible-evaluation { stroke: var(--dm-primary); stroke-width: 3; }
.decision-widget .dm-full-quality { stroke: var(--dm-primary); }
.decision-widget .dm-threshold { stroke: var(--dm-accent); stroke-width: 1.5; stroke-dasharray: 8 3 2 3; }
.decision-widget .dm-optimum-line { stroke: var(--dm-secondary); stroke-width: 1.5; stroke-dasharray: 3 4; opacity: .9; }
.decision-widget .dm-local-line { stroke: var(--dm-secondary); stroke-width: 1.5; stroke-dasharray: 7 4; opacity: .9; }
.decision-widget .dm-full-line { stroke: var(--dm-accent); stroke-width: 1.8; opacity: .95; }
.decision-widget .dm-local-point { fill: transparent; stroke: var(--dm-secondary); stroke-width: 2.2; }
.decision-widget .dm-full-point { fill: var(--dm-accent); stroke: white; stroke-width: 1.25; }
.decision-widget .dm-optimum-point { fill: var(--dm-secondary); stroke: white; stroke-width: 1.25; }
.decision-widget .dm-boundary-point { fill: var(--dm-secondary); stroke: var(--dm-secondary); }
.decision-widget .dm-feasible-band { fill: var(--dm-primary); opacity: .075; }
.decision-widget .dm-legends {
  display: flex;
  flex-wrap: wrap;
  gap: .28rem .8rem;
  margin: .35rem 0 0;
  padding: 0;
  list-style: none;
  font-size: .72rem;
  line-height: 1.4;
}
.decision-widget .dm-legends li { display: flex; align-items: center; gap: .32rem; }
.decision-widget .dm-swatch { display: inline-block; width: 1.45rem; flex: 0 0 1.45rem; border-top: 3px solid currentColor; }
.decision-widget .dm-swatch-quality,
.decision-widget .dm-swatch-marginal,
.decision-widget .dm-swatch-feasible { color: var(--dm-primary); }
.decision-widget .dm-swatch-expectation { color: var(--dm-accent); border-top-style: dashed; }
.decision-widget .dm-swatch-slope,
.decision-widget .dm-swatch-local { color: var(--dm-secondary); border-top-style: dashed; }
.decision-widget .dm-swatch-all { color: var(--dm-muted); border-top-style: dashed; }
.decision-widget .dm-swatch-full { color: var(--dm-accent); }
.decision-widget .dm-swatch-threshold { color: var(--dm-accent); border-top-style: dotted; }
.decision-widget .dm-details {
  margin: .8rem 0 0;
  padding: .48rem .68rem;
  border-left: 3px solid var(--dm-primary);
  background: var(--dm-surface);
  font-size: .8rem;
  line-height: 1.5;
}
.decision-widget .dm-details[data-state="outside"] { border-left-color: var(--dm-accent); }
.decision-widget .dm-details p { margin: .2rem 0; }
.quarto-dark .decision-widget,
[data-bs-theme="dark"] .decision-widget {
  --dm-primary: #62cbd3;
  --dm-secondary: #efa069;
  --dm-accent: #d6a9ca;
  --dm-muted: #b7c0c7;
  --dm-border: rgba(255, 255, 255, .22);
  --dm-surface: rgba(255, 255, 255, .055);
}
@container (max-width: 470px) {
  .decision-widget .dm-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 320px) {
  .decision-widget .dm-metrics { grid-template-columns: minmax(0, 1fr); }
}
@media print {
  .decision-widget .dm-controls,
  .decision-widget .dm-actions { display: none; }
  .decision-widget .dm-panel { break-inside: avoid; }
}
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

function svgText(parent, content, attributes = {}) {
  const node = svgElement("text", attributes);
  node.textContent = content;
  parent.append(node);
  return node;
}

function format(value, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(decimals);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

function setOutput(output, value) {
  output.value = value;
  output.textContent = value;
}

function sampleRange(maximum, count = 241) {
  return Array.from({ length: count }, (_, index) => maximum * index / (count - 1));
}

function xTicks(maximum, width) {
  const intervals = width < 390 ? 3 : 5;
  return Array.from({ length: intervals + 1 }, (_, index) => maximum * index / intervals);
}

function paddedDomain(values, { includeZero = true, nonnegative = false } = {}) {
  const finite = values.filter(Number.isFinite);
  if (includeZero) finite.push(0);
  let minimum = Math.min(...finite);
  let maximum = Math.max(...finite);
  if (minimum === maximum) {
    const expansion = Math.max(1, Math.abs(minimum) * .1);
    minimum -= expansion;
    maximum += expansion;
  }
  const padding = Math.max(1e-6, (maximum - minimum) * .08);
  minimum -= padding;
  maximum += padding;
  if (nonnegative) minimum = 0;
  return [minimum, maximum];
}

function addAccessibility(svg, titleId, descriptionId, title, description) {
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", `${titleId} ${descriptionId}`);
  const titleNode = svgElement("title", { id: titleId });
  titleNode.textContent = title;
  const descriptionNode = svgElement("desc", { id: descriptionId });
  descriptionNode.textContent = description;
  svg.append(titleNode, descriptionNode);
}

function createFrame({ id, width, height = 228, xDomain, yDomain, title, description,
  xLabel, yLabel }) {
  const margin = { top: 24, right: 15, bottom: 43, left: 48 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const [xMinimum, xMaximum] = xDomain;
  const [yMinimum, yMaximum] = yDomain;
  const xScale = value => margin.left
    + (value - xMinimum) / (xMaximum - xMinimum) * innerWidth;
  const yScale = value => margin.top
    + (yMaximum - value) / (yMaximum - yMinimum) * innerHeight;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}` });
  addAccessibility(svg, `${id}-title`, `${id}-desc`, title, description);
  const background = svgElement("g");
  const grid = svgElement("g");
  const data = svgElement("g");
  const overlay = svgElement("g");
  svg.append(background, grid, data, overlay);

  for (const tick of xTicks(xMaximum - xMinimum, width).map(value => value + xMinimum)) {
    grid.append(svgElement("line", {
      x1: xScale(tick), x2: xScale(tick), y1: margin.top,
      y2: margin.top + innerHeight, class: "dm-grid",
    }));
    svgText(grid, format(tick, xMaximum <= 10 ? 1 : 0), {
      x: xScale(tick), y: margin.top + innerHeight + 17, "text-anchor": "middle",
    });
  }
  for (let index = 0; index <= 4; index += 1) {
    const tick = yMinimum + (yMaximum - yMinimum) * index / 4;
    grid.append(svgElement("line", {
      x1: margin.left, x2: margin.left + innerWidth,
      y1: yScale(tick), y2: yScale(tick), class: "dm-grid",
    }));
    svgText(grid, format(tick, Math.abs(yMaximum - yMinimum) < 20 ? 1 : 0), {
      x: margin.left - 6, y: yScale(tick) + 4, "text-anchor": "end",
    });
  }
  grid.append(svgElement("path", {
    d: `M${margin.left},${margin.top} V${margin.top + innerHeight} H${margin.left + innerWidth}`,
    class: "dm-axis",
  }));
  if (yMinimum < 0 && yMaximum > 0) {
    grid.append(svgElement("line", {
      x1: margin.left, x2: margin.left + innerWidth,
      y1: yScale(0), y2: yScale(0), class: "dm-zero",
    }));
  }
  svgText(grid, yLabel, { x: margin.left, y: 14, class: "dm-axis-title" });
  svgText(grid, xLabel, {
    x: width / 2, y: height - 6, "text-anchor": "middle", class: "dm-axis-title",
  });
  return {
    svg, background, data, overlay, xScale, yScale,
    xMinimum, xMaximum, yMinimum, yMaximum,
    plotTop: margin.top, plotBottom: margin.top + innerHeight,
  };
}

function pathData(points, frame, predicate = () => true) {
  let open = false;
  const commands = [];
  for (const point of points) {
    if (!predicate(point) || !Number.isFinite(point.y)) {
      open = false;
      continue;
    }
    commands.push(`${open ? "L" : "M"}${frame.xScale(point.x).toFixed(2)},${frame.yScale(point.y).toFixed(2)}`);
    open = true;
  }
  return commands.join(" ");
}

function addPath(frame, points, className, predicate) {
  const path = pathData(points, frame, predicate);
  if (path) frame.data.append(svgElement("path", { d: path, class: `dm-line ${className}` }));
}

function addVerticalLine(frame, x, className) {
  frame.overlay.append(svgElement("line", {
    x1: frame.xScale(x), x2: frame.xScale(x),
    y1: frame.plotTop, y2: frame.plotBottom, class: className,
  }));
}

function addCircle(frame, x, y, className, radius = 4.8) {
  frame.overlay.append(svgElement("circle", {
    cx: frame.xScale(x), cy: frame.yScale(y), r: radius, class: className,
  }));
}

function addDiamond(frame, x, y, className) {
  const centerX = frame.xScale(x);
  const centerY = frame.yScale(y);
  frame.overlay.append(svgElement("polygon", {
    points: `${centerX},${centerY - 5.5} ${centerX + 5.5},${centerY} ${centerX},${centerY + 5.5} ${centerX - 5.5},${centerY}`,
    class: className,
  }));
}

function addBoundaryTriangle(frame, x, y) {
  const centerX = frame.xScale(x);
  const centerY = frame.yScale(y);
  const points = x <= frame.xMinimum + 1e-8
    ? `${centerX},${centerY} ${centerX + 9},${centerY - 5} ${centerX + 9},${centerY + 5}`
    : `${centerX},${centerY} ${centerX - 9},${centerY - 5} ${centerX - 9},${centerY + 5}`;
  frame.overlay.append(svgElement("polygon", { points, class: "dm-boundary-point" }));
}

function createLegend(entries) {
  const list = htmlElement("ul", "dm-legends");
  list.setAttribute("aria-label", "グラフの凡例");
  for (const [className, label] of entries) {
    const item = htmlElement("li");
    const swatch = htmlElement("span", `dm-swatch ${className}`);
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, document.createTextNode(label));
    list.append(item);
  }
  return list;
}

function createMetric(label) {
  const card = htmlElement("div", "dm-metric");
  const labelNode = htmlElement("p", "dm-metric-label", label);
  const output = htmlElement("output", "dm-metric-value", "—");
  output.setAttribute("aria-label", label);
  card.append(labelNode, output);
  return { card, output };
}

function createPanel(title, note) {
  const panel = htmlElement("figure", "dm-panel");
  const caption = htmlElement("figcaption", "dm-panel-title", title);
  const noteNode = htmlElement("p", "dm-panel-note", note);
  const chart = htmlElement("div", "dm-chart");
  panel.append(caption, noteNode, chart);
  return { panel, chart };
}

function createRoot(title, intro) {
  const id = `decision-widget-${++nextWidgetId}`;
  const root = htmlElement("section", "decision-widget");
  root.setAttribute("role", "group");
  root.setAttribute("aria-labelledby", `${id}-heading`);
  const style = htmlElement("style");
  style.textContent = STYLES;
  const header = htmlElement("header", "dm-header");
  const heading = htmlElement("div", "dm-title", title);
  heading.id = `${id}-heading`;
  heading.setAttribute("role", "heading");
  heading.setAttribute("aria-level", "4");
  const introNode = htmlElement("p", "dm-intro", intro);
  const status = htmlElement("p", "dm-status", "表示を計算しています");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  header.append(heading, introNode, status);
  root.append(style, header);
  return { root, id, status };
}

function createControls(instance, state, defaults, descriptors, onChange) {
  const controller = new AbortController();
  const fieldset = htmlElement("fieldset", "dm-controls");
  fieldset.append(htmlElement("legend", undefined, "パラメータ"));
  const records = [];
  for (const descriptor of descriptors) {
    const wrapper = htmlElement("div", "dm-control");
    const label = htmlElement("label");
    const labelText = htmlElement("span", undefined, descriptor.label);
    const output = htmlElement("output", undefined,
      format(state[descriptor.key], descriptor.decimals));
    const input = htmlElement("input");
    const range = htmlElement("div", "dm-range",
      `範囲 ${format(descriptor.min, descriptor.decimals)}–${format(descriptor.max, descriptor.decimals)}`);
    input.id = `${instance.id}-${descriptor.key}`;
    input.type = "range";
    input.min = String(descriptor.min);
    input.max = String(descriptor.max);
    input.step = String(descriptor.step);
    input.value = String(state[descriptor.key]);
    label.htmlFor = input.id;
    output.setAttribute("for", input.id);
    label.append(labelText, output);
    input.addEventListener("input", () => {
      state[descriptor.key] = input.valueAsNumber;
      setOutput(output, format(input.valueAsNumber, descriptor.decimals));
      onChange();
    }, { signal: controller.signal });
    wrapper.append(label, input, range);
    fieldset.append(wrapper);
    records.push({ descriptor, input, output });
  }
  const actions = htmlElement("div", "dm-actions");
  const reset = htmlElement("button", "dm-reset", "初期値へ戻す");
  reset.type = "button";
  reset.addEventListener("click", () => {
    Object.assign(state, defaults);
    for (const { descriptor, input, output } of records) {
      input.value = String(state[descriptor.key]);
      setOutput(output, format(state[descriptor.key], descriptor.decimals));
    }
    onChange();
  }, { signal: controller.signal });
  actions.append(reset);
  instance.root.append(fieldset, actions);
  return () => controller.abort();
}

function installResponsiveRedraw(measureElement, redraw, cleanup) {
  let previousWidth = 0;
  const run = () => {
    const measured = measureElement.getBoundingClientRect().width;
    const width = Math.max(270, Math.round(measured || 680));
    previousWidth = width;
    redraw(width);
  };
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(entries => {
      const width = Math.max(270, Math.round(entries[0].contentRect.width || 680));
      if (width !== previousWidth) run();
    });
    observer.observe(measureElement);
    cleanup.push(() => observer.disconnect());
  } else {
    window.addEventListener("resize", run);
    cleanup.push(() => window.removeEventListener("resize", run));
  }
  run();
}

function boundaryKind(optimum, horizon) {
  const tolerance = 1e-8 * Math.max(1, horizon);
  if (optimum <= tolerance) return "earliest";
  if (optimum >= horizon - tolerance) return "deadline";
  return "interior";
}

function drawSlopePanels(instance, panels, state, width) {
  const times = sampleRange(DEADLINE);
  const optimum = localOptimalReviewTime(state);
  const kind = boundaryKind(optimum, DEADLINE);
  const quality = times.map(time => ({ x: time, y: baselineQuality(time, state) }));
  const expectation = times.map(time => ({
    x: time,
    y: managerExpectation(time, state),
  }));
  const marginal = times.map(time => ({
    x: time,
    y: baselineMarginalQuality(time, state),
  }));
  const evaluation = times.map(time => ({
    x: time,
    y: localReviewEvaluation(time, state),
  }));
  const optimumMarginal = baselineMarginalQuality(optimum, state);
  const optimumEvaluation = localReviewEvaluation(optimum, state);

  const qualityFrame = createFrame({
    id: `${instance.id}-slope-quality`, width, xDomain: [0, DEADLINE],
    yDomain: paddedDomain([
      ...quality.map(point => point.y), ...expectation.map(point => point.y),
    ], { nonnegative: true }),
    title: "品質と期待値",
    description: `品質と期待値の水準を時刻0から${DEADLINE}まで示します。最適レビュー時刻は${format(optimum)}です。Panel Bの傾き一致が判断基準です。`,
    xLabel: "カレンダー時刻 t", yLabel: "品質 / 期待値",
  });
  addPath(qualityFrame, quality, "dm-quality");
  addPath(qualityFrame, expectation, "dm-expectation");
  addVerticalLine(qualityFrame, optimum, "dm-optimum-line");
  panels.quality.chart.replaceChildren(qualityFrame.svg);

  const marginalFrame = createFrame({
    id: `${instance.id}-slope-marginal`, width, xDomain: [0, DEADLINE],
    yDomain: paddedDomain([
      ...marginal.map(point => point.y), state.b,
    ], { nonnegative: true }),
    title: "限界品質改善と期待上昇率",
    description: kind === "interior"
      ? `時刻${format(optimum)}で限界品質改善${format(optimumMarginal)}と期待上昇率${format(state.b)}が一致します。`
      : `境界時刻${format(optimum)}が中間レビュー評価を最大にします。`,
    xLabel: "カレンダー時刻 t", yLabel: "限界量",
  });
  addPath(marginalFrame, marginal, "dm-marginal");
  addPath(marginalFrame, [
    { x: 0, y: state.b }, { x: DEADLINE, y: state.b },
  ], "dm-slope");
  addVerticalLine(marginalFrame, optimum, "dm-optimum-line");
  if (kind === "interior") {
    addDiamond(marginalFrame, optimum, state.b, "dm-local-point");
  } else {
    addBoundaryTriangle(marginalFrame, optimum, optimumMarginal);
  }
  panels.marginal.chart.replaceChildren(marginalFrame.svg);

  const evaluationFrame = createFrame({
    id: `${instance.id}-slope-evaluation`, width, xDomain: [0, DEADLINE],
    yDomain: paddedDomain(evaluation.map(point => point.y)),
    title: "中間レビュー評価",
    description: `中間レビュー評価vRは時刻${format(optimum)}で最大値${format(optimumEvaluation)}を取ります。`,
    xLabel: "カレンダー時刻 t", yLabel: "vᴿ(t)",
  });
  addPath(evaluationFrame, evaluation, "dm-evaluation");
  addVerticalLine(evaluationFrame, optimum, "dm-optimum-line");
  addCircle(evaluationFrame, optimum, optimumEvaluation, "dm-optimum-point");
  panels.evaluation.chart.replaceChildren(evaluationFrame.svg);

  return { optimum, kind, optimumMarginal, optimumEvaluation };
}

/** Independent analytical visualization for the local slope-matching benchmark. */
export function renderSlopeMatching(initial = {}) {
  const defaults = { ...SLOPE_DEFAULTS, ...initial };
  const state = { ...defaults };
  const instance = createRoot(
    "限界品質改善と期待上昇率",
    "中間レビュー評価だけを対象とするbenchmarkを、三つの視点から確認します。",
  );
  const cleanup = [];
  let disposed = false;
  let timer;
  let revision = 0;

  const descriptors = [
    { key: "qbar", label: "基準品質の上限 q̄", min: 55, max: 100, step: 1, decimals: 0 },
    { key: "k", label: "初期品質改善 k", min: .1, max: .8, step: .05, decimals: 2 },
    { key: "a", label: "初期期待値 a", min: 0, max: 80, step: 1, decimals: 0 },
    { key: "b", label: "期待上昇率 b", min: 0, max: 20, step: .25, decimals: 2 },
  ];
  let schedule = () => {};
  cleanup.push(createControls(instance, state, defaults, descriptors, () => schedule()));

  const metrics = htmlElement("div", "dm-metrics");
  const metricItems = {
    optimum: createMetric("最適レビュー時刻 τ*"),
    marginal: createMetric("q₀′(τ*)"),
    slope: createMetric("期待上昇率 b"),
    evaluation: createMetric("中間レビュー評価 vᴿ(τ*)"),
  };
  for (const metric of Object.values(metricItems)) metrics.append(metric.card);
  instance.root.append(metrics);

  const plots = htmlElement("div", "dm-plots");
  const panels = {
    quality: createPanel("Panel A：品質と期待値",
      "Panel Bの傾き一致が最適時刻を決めます。"),
    marginal: createPanel("Panel B：限界量",
      "限界品質改善 q₀′(t) と期待上昇率 b を比較します。"),
    evaluation: createPanel("Panel C：中間レビュー評価",
      "vᴿ(t) の最大点が共通の縦線に対応します。"),
  };
  panels.quality.panel.append(createLegend([
    ["dm-swatch-quality", "品質 q₀(t)"],
    ["dm-swatch-expectation", "期待値 e(t)"],
    ["dm-swatch-local", "最適時刻 τ*"],
  ]));
  panels.marginal.panel.append(createLegend([
    ["dm-swatch-marginal", "限界品質改善 q₀′(t)"],
    ["dm-swatch-slope", "期待上昇率 b"],
    ["dm-swatch-local", "傾き一致 / 境界"],
  ]));
  panels.evaluation.panel.append(createLegend([
    ["dm-swatch-quality", "中間レビュー評価 vᴿ(t)"],
    ["dm-swatch-local", "最大点 τ*"],
  ]));
  plots.append(panels.quality.panel, panels.marginal.panel, panels.evaluation.panel);
  const details = htmlElement("div", "dm-details");
  instance.root.append(plots, details);

  let currentWidth = 680;
  const render = () => {
    const values = drawSlopePanels(instance, panels, state, currentWidth);
    setOutput(metricItems.optimum.output, format(values.optimum));
    setOutput(metricItems.marginal.output, format(values.optimumMarginal));
    setOutput(metricItems.slope.output, format(state.b));
    setOutput(metricItems.evaluation.output, format(values.optimumEvaluation));
    if (values.kind === "interior") {
      instance.status.textContent = "内点の傾き一致";
      instance.status.dataset.state = "interior";
      details.textContent = `q₀′(${format(values.optimum)}) = ${format(values.optimumMarginal)}、b = ${format(state.b)}。傾きの一致が中間レビュー評価の最大点に対応します。`;
    } else if (values.kind === "earliest") {
      instance.status.textContent = "最早境界 t = 0 が最大点";
      instance.status.dataset.state = "boundary";
      details.textContent = `時刻0の限界品質改善は${format(values.optimumMarginal)}、期待上昇率は${format(state.b)}です。最早境界がbenchmarkの最大点です。`;
    } else {
      instance.status.textContent = `期限境界 t = ${DEADLINE} が最大点`;
      instance.status.dataset.state = "boundary";
      details.textContent = `期限時点の限界品質改善は${format(values.optimumMarginal)}、期待上昇率は${format(state.b)}です。期限境界がbenchmarkの最大点です。`;
    }
    instance.root.setAttribute("aria-busy", "false");
  };

  schedule = (delay = REDRAW_DELAY) => {
    revision += 1;
    const requested = revision;
    clearTimeout(timer);
    instance.root.setAttribute("aria-busy", "true");
    instance.status.textContent = "表示を計算しています";
    instance.status.dataset.state = "working";
    timer = setTimeout(() => {
      if (disposed || requested !== revision) return;
      render();
    }, delay);
  };
  installResponsiveRedraw(plots, width => {
    currentWidth = width;
    if (!disposed) render();
  }, cleanup);

  instance.root.dispose = () => {
    if (disposed) return;
    disposed = true;
    revision += 1;
    clearTimeout(timer);
    for (const dispose of cleanup) dispose();
  };
  return instance.root;
}

function addFeasibleBands(frame, points) {
  let start = null;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point.feasible && start === null) start = point.x;
    const closes = start !== null && (!point.feasible || index === points.length - 1);
    if (closes) {
      const prior = points[Math.max(0, index - (point.feasible ? 0 : 1))];
      const end = prior.x;
      frame.background.append(svgElement("rect", {
        x: frame.xScale(start), y: frame.plotTop,
        width: Math.max(0, frame.xScale(end) - frame.xScale(start)),
        height: frame.plotBottom - frame.plotTop,
        class: "dm-feasible-band",
      }));
      start = null;
    }
  }
}

function drawFullPanels(instance, panels, state, result, width) {
  // Match the optimizer grid so narrow feasible intervals remain visible.
  const reviewTimes = sampleRange(state.totalWork, 2001);
  const points = reviewTimes.map(reviewTime => {
    const finalQuality = reviewedQuality(
      reviewTime,
      state.totalWork - reviewTime,
      state,
    );
    return {
      x: reviewTime,
      evaluation: fullEvaluationAtReviewTime(reviewTime, state),
      quality: finalQuality,
      feasible: finalQuality >= MINIMUM_QUALITY,
    };
  });
  const localTime = result.localReviewTime;
  const localPoint = {
    x: localTime,
    evaluation: fullEvaluationAtReviewTime(localTime, state),
    quality: reviewedQuality(localTime, state.totalWork - localTime, state),
  };

  const evaluationFrame = createFrame({
    id: `${instance.id}-full-evaluation`, width,
    xDomain: [0, state.totalWork],
    yDomain: paddedDomain(points.map(point => point.evaluation)),
    title: "固定総作業量における総合評価",
    description: result.feasible
      ? `区間[0, W]の局所benchmarkは${format(localTime)}、品質基準を満たす完全モデルの最適レビュー時刻は${format(result.reviewTime)}です。`
      : `総作業量${format(state.totalWork)}における総合評価を示します。現在値は品質基準の達成領域外です。`,
    xLabel: "レビュー前作業 x", yLabel: "総合評価 V(x)",
  });
  addFeasibleBands(evaluationFrame, points);
  addPath(evaluationFrame,
    points.map(point => ({ x: point.x, y: point.evaluation, feasible: point.feasible })),
    "dm-all-evaluation");
  addPath(evaluationFrame,
    points.map(point => ({ x: point.x, y: point.evaluation, feasible: point.feasible })),
    "dm-feasible-evaluation", point => point.feasible);
  addVerticalLine(evaluationFrame, localTime, "dm-local-line");
  addDiamond(evaluationFrame, localTime, localPoint.evaluation, "dm-local-point");
  if (result.feasible) {
    addVerticalLine(evaluationFrame, result.reviewTime, "dm-full-line");
    addCircle(evaluationFrame, result.reviewTime, result.evaluation, "dm-full-point", 5.2);
  }
  panels.evaluation.chart.replaceChildren(evaluationFrame.svg);

  const qualityFrame = createFrame({
    id: `${instance.id}-full-quality`, width,
    xDomain: [0, state.totalWork],
    yDomain: paddedDomain([
      ...points.map(point => point.quality), MINIMUM_QUALITY,
    ], { nonnegative: true }),
    title: "レビュー前作業と最終品質",
    description: result.feasible
      ? `品質基準${MINIMUM_QUALITY}と最終品質を比較します。完全モデルの最適点における品質は${format(result.finalQuality)}です。`
      : `品質基準${MINIMUM_QUALITY}と最終品質を比較します。現在値は品質基準の達成領域外です。`,
    xLabel: "レビュー前作業 x", yLabel: "最終品質 Q(x, W−x)",
  });
  addFeasibleBands(qualityFrame, points);
  addPath(qualityFrame,
    points.map(point => ({ x: point.x, y: point.quality })), "dm-full-quality");
  addPath(qualityFrame, [
    { x: 0, y: MINIMUM_QUALITY },
    { x: state.totalWork, y: MINIMUM_QUALITY },
  ], "dm-threshold");
  addVerticalLine(qualityFrame, localTime, "dm-local-line");
  addDiamond(qualityFrame, localTime, localPoint.quality, "dm-local-point");
  if (result.feasible) {
    addVerticalLine(qualityFrame, result.reviewTime, "dm-full-line");
    addCircle(qualityFrame, result.reviewTime, result.finalQuality, "dm-full-point", 5.2);
  }
  panels.quality.chart.replaceChildren(qualityFrame.svg);
  return localPoint;
}

/** Independent one-dimensional optimization visualization for fixed total work. */
export function renderFullEvaluation(initial = {}) {
  const defaults = { ...DEFAULT_FIXED_WORK, ...initial };
  const state = { ...defaults };
  const instance = createRoot(
    "総合評価を最大化するレビュー時刻",
    "総作業量Wを保ち、区間[0, W]の局所benchmarkとレビュー後効果を含む完全モデルを比較します。",
  );
  const cleanup = [];
  let disposed = false;
  let timer;
  let revision = 0;
  let currentWidth = 680;

  const descriptors = [
    { key: "totalWork", label: "総作業量 W", min: 1, max: DEADLINE, step: .5, decimals: 1 },
    { key: "qbar", label: "基準品質の上限 q̄", min: 55, max: 100, step: 1, decimals: 0 },
    { key: "k", label: "初期品質改善 k", min: .1, max: .8, step: .05, decimals: 2 },
    { key: "h", label: "レビューの成熟尺度 h", min: .5, max: 8, step: .25, decimals: 2 },
    { key: "a", label: "初期期待値 a", min: 0, max: 80, step: 1, decimals: 0 },
    { key: "b", label: "期待上昇率 b", min: 0, max: 20, step: .25, decimals: 2 },
  ];
  let schedule = () => {};
  cleanup.push(createControls(instance, state, defaults, descriptors, () => schedule()));

  const metrics = htmlElement("div", "dm-metrics");
  const metricItems = {
    local: createMetric("局所benchmark τlocal*(W)"),
    full: createMetric("完全モデル x*"),
    difference: createMetric("時刻差 x* − τlocal*(W)"),
    evaluation: createMetric("総合評価 V(x*)"),
    quality: createMetric("最終品質 Q(x*)"),
    after: createMetric("レビュー後作業 y*"),
  };
  for (const metric of Object.values(metricItems)) metrics.append(metric.card);
  instance.root.append(metrics);

  const plots = htmlElement("div", "dm-plots");
  const panels = {
    evaluation: createPanel("総合評価 V(x)",
      "背景色は品質基準の達成領域、二つのmarkerは局所benchmarkと完全モデルを表します。"),
    quality: createPanel("最終品質 Q(x, W−x)",
      `最低品質${MINIMUM_QUALITY}と、レビュー前後の時間配分から得られる品質を比較します。`),
  };
  panels.evaluation.panel.append(createLegend([
    ["dm-swatch-all", "全領域のV(x)"],
    ["dm-swatch-feasible", "品質基準達成領域のV(x)"],
    ["dm-swatch-local", "局所benchmark [0, W]"],
    ["dm-swatch-full", "完全モデル"],
  ]));
  panels.quality.panel.append(createLegend([
    ["dm-swatch-quality", "最終品質 Q(x, W−x)"],
    ["dm-swatch-threshold", `最低品質 ${MINIMUM_QUALITY}`],
    ["dm-swatch-local", "局所benchmark [0, W]"],
    ["dm-swatch-full", "完全モデル"],
  ]));
  plots.append(panels.evaluation.panel, panels.quality.panel);
  const details = htmlElement("div", "dm-details");
  instance.root.append(plots, details);

  const render = () => {
    const result = optimalReviewTimeForFixedWork(state);
    drawFullPanels(instance, panels, state, result, currentWidth);
    setOutput(metricItems.local.output, format(result.localReviewTime));
    if (result.feasible) {
      setOutput(metricItems.full.output, format(result.reviewTime));
      setOutput(metricItems.difference.output,
        format(result.reviewTime - result.localReviewTime));
      setOutput(metricItems.evaluation.output, format(result.evaluation));
      setOutput(metricItems.quality.output, format(result.finalQuality));
      setOutput(metricItems.after.output, format(result.postReviewWork));
      instance.status.textContent = "品質基準を満たす完全モデル解";
      instance.status.dataset.state = "feasible";
      details.dataset.state = "feasible";
      details.replaceChildren(
        htmlElement("p", undefined,
          `局所benchmark：x = ${format(result.localReviewTime)}。完全モデル：x = ${format(result.reviewTime)}。時刻差は${format(result.reviewTime - result.localReviewTime)}です。`),
        htmlElement("p", undefined,
          `x* = ${format(result.reviewTime)}、y* = ${format(result.postReviewWork)}、Q − ${MINIMUM_QUALITY} = ${format(result.qualityMargin)}。`),
        htmlElement("p", undefined,
          "q₀′ = b は中間レビュー評価のbenchmark条件であり、完全モデルにはレビュー後品質の効果が加わります。"),
      );
    } else {
      for (const metric of ["full", "difference", "evaluation", "quality", "after"]) {
        setOutput(metricItems[metric].output, "—");
      }
      instance.status.textContent = "品質基準の達成領域外（infeasible）";
      instance.status.dataset.state = "outside";
      details.dataset.state = "outside";
      const bestQuality = result.bestAttempt?.finalQuality;
      const shortfall = Number.isFinite(bestQuality)
        ? Math.max(0, MINIMUM_QUALITY - bestQuality)
        : Number.NaN;
      details.replaceChildren(
        htmlElement("p", undefined,
          `局所benchmark：x = ${format(result.localReviewTime)}。総作業量W = ${format(result.totalWork)}。`),
        htmlElement("p", undefined,
          `探索点の最高品質は${format(bestQuality)}、品質基準までの差は${format(shortfall)}です。`),
      );
    }
    instance.root.setAttribute("aria-busy", "false");
  };

  schedule = (delay = REDRAW_DELAY) => {
    revision += 1;
    const requested = revision;
    clearTimeout(timer);
    instance.root.setAttribute("aria-busy", "true");
    instance.status.textContent = "最適点を計算しています";
    instance.status.dataset.state = "working";
    timer = setTimeout(() => {
      if (disposed || requested !== revision) return;
      render();
    }, delay);
  };
  installResponsiveRedraw(plots, width => {
    currentWidth = width;
    if (!disposed) render();
  }, cleanup);

  instance.root.dispose = () => {
    if (disposed) return;
    disposed = true;
    revision += 1;
    clearTimeout(timer);
    for (const dispose of cleanup) dispose();
  };
  return instance.root;
}
