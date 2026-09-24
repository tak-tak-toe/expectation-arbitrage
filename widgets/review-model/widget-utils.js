const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
let nextWidgetId = 0;

export const MODEL_WIDGET_STYLES = `
.model-widget {
  --mw-primary: #087e8b;
  --mw-secondary: #b5571c;
  --mw-accent: #8d647d;
  --mw-muted: #707780;
  --mw-border: rgba(8, 126, 139, .28);
  --mw-surface: rgba(8, 126, 139, .055);
  color: inherit;
  container-type: inline-size;
  font-family: inherit;
  min-width: 0;
}
.model-widget * { box-sizing: border-box; }
.model-widget .mw-header { display: grid; gap: .4rem; margin: 0 0 .85rem; }
.model-widget .mw-title { margin: 0; font-size: 1.08rem; font-weight: 700; line-height: 1.35; }
.model-widget .mw-intro,
.model-widget .mw-note { margin: 0; font-size: .84rem; line-height: 1.55; }
.model-widget .mw-status {
  justify-self: start;
  margin: .1rem 0 0;
  padding: .22rem .55rem;
  border: 1px solid var(--mw-border);
  border-radius: 999px;
  background: var(--mw-surface);
  font-size: .78rem;
  font-weight: 650;
  line-height: 1.35;
}
.model-widget .mw-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: .55rem .8rem;
  margin: 0 0 .65rem;
  padding: .75rem;
  border: 1px solid var(--mw-border);
  border-radius: .4rem;
  background: var(--mw-surface);
}
.model-widget .mw-controls legend { padding: 0 .25rem; font-size: .88rem; font-weight: 700; }
.model-widget .mw-control { min-width: 0; }
.model-widget .mw-control label {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: .2rem .55rem;
  margin: 0 0 .12rem;
  font-size: .8rem;
  line-height: 1.4;
}
.model-widget .mw-control output { font-variant-numeric: tabular-nums; font-weight: 700; }
.model-widget .mw-control input[type="range"] {
  display: block;
  width: 100%;
  margin: .18rem 0 .05rem;
  accent-color: var(--mw-primary);
}
.model-widget .mw-control input[type="range"]:focus-visible,
.model-widget .mw-reset:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.model-widget .mw-range { color: var(--mw-muted); font-size: .69rem; }
.model-widget .mw-actions { display: flex; justify-content: flex-end; margin: 0 0 .75rem; }
.model-widget .mw-reset {
  border: 1px solid var(--mw-border);
  border-radius: .35rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: .76rem;
  padding: .35rem .62rem;
}
.model-widget .mw-reset:hover { background: var(--mw-surface); }
.model-widget .mw-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr));
  gap: .55rem;
  margin: 0 0 .9rem;
}
.model-widget .mw-metric {
  min-width: 0;
  padding: .65rem;
  border: 1px solid var(--mw-border);
  border-radius: .35rem;
  background: var(--mw-surface);
}
.model-widget .mw-metric-label { margin: 0 0 .16rem; font-size: .73rem; line-height: 1.35; }
.model-widget .mw-metric-value {
  display: block;
  margin: 0;
  font-size: 1.14rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.model-widget .mw-plots { display: grid; gap: .9rem; min-width: 0; }
.model-widget .mw-plot-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .9rem; min-width: 0; }
@container (max-width: 700px) {
  .model-widget .mw-plot-pair { grid-template-columns: minmax(0, 1fr); }
}
.model-widget .mw-panel {
  min-width: 0;
  margin: 0;
  padding: .55rem .55rem .45rem;
  border: 1px solid var(--mw-border);
  border-radius: .38rem;
}
.model-widget .mw-panel-title { margin: 0 0 .2rem; font-size: .84rem; font-weight: 700; line-height: 1.4; }
.model-widget .mw-panel-note { margin: 0 0 .25rem; font-size: .74rem; line-height: 1.45; }
.model-widget .mw-chart { min-width: 0; }
.model-widget svg { display: block; width: 100%; height: auto; overflow: visible; font-family: inherit; }
.model-widget svg text { fill: currentColor; font-size: 11px; }
.model-widget svg .mw-axis-title { font-size: 12px; font-weight: 600; }
.model-widget .mw-grid { stroke: currentColor; stroke-width: 1; opacity: .12; }
.model-widget .mw-axis { fill: none; stroke: currentColor; stroke-width: 1; opacity: .58; }
.model-widget .mw-zero { stroke: currentColor; stroke-width: 1.2; opacity: .32; }
.model-widget .mw-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2.45; vector-effect: non-scaling-stroke; }
.model-widget .mw-primary { stroke: var(--mw-primary); }
.model-widget .mw-secondary { stroke: var(--mw-secondary); stroke-dasharray: 7 4; }
.model-widget .mw-accent { stroke: var(--mw-accent); }
.model-widget .mw-muted { stroke: var(--mw-muted); stroke-dasharray: 5 4; }
.model-widget .mw-threshold { stroke: var(--mw-accent); stroke-width: 1.5; stroke-dasharray: 8 3 2 3; }
.model-widget .mw-marker { stroke: var(--mw-secondary); stroke-width: 1.5; stroke-dasharray: 3 4; opacity: .9; }
.model-widget .mw-marker-accent { stroke: var(--mw-accent); stroke-width: 1.7; stroke-dasharray: 7 4; opacity: .9; }
.model-widget .mw-point { fill: var(--mw-secondary); stroke: white; stroke-width: 1.25; }
.model-widget .mw-point-accent { fill: var(--mw-accent); stroke: white; stroke-width: 1.25; }
.model-widget .mw-point-hollow { fill: transparent; stroke: var(--mw-secondary); stroke-width: 2.2; }
.model-widget .mw-band { fill: var(--mw-primary); opacity: .075; }
.model-widget .mw-legends {
  display: flex;
  flex-wrap: wrap;
  gap: .28rem .8rem;
  margin: .35rem 0 0;
  padding: 0;
  list-style: none;
  font-size: .72rem;
  line-height: 1.4;
}
.model-widget .mw-legends li { display: flex; align-items: center; gap: .32rem; }
.model-widget .mw-swatch { display: inline-block; width: 1.45rem; flex: 0 0 1.45rem; border-top: 3px solid currentColor; }
.model-widget .mw-swatch-primary { color: var(--mw-primary); }
.model-widget .mw-swatch-secondary { color: var(--mw-secondary); border-top-style: dashed; }
.model-widget .mw-swatch-accent { color: var(--mw-accent); }
.model-widget .mw-swatch-muted { color: var(--mw-muted); border-top-style: dashed; }
.model-widget .mw-swatch-threshold { color: var(--mw-accent); border-top-style: dotted; }
.model-widget .mw-details {
  margin: .8rem 0 0;
  padding: .48rem .68rem;
  border-left: 3px solid var(--mw-primary);
  background: var(--mw-surface);
  font-size: .8rem;
  line-height: 1.5;
}
.model-widget .mw-details p { margin: .2rem 0; }
.quarto-dark .model-widget,
[data-bs-theme="dark"] .model-widget {
  --mw-primary: #62cbd3;
  --mw-secondary: #efa069;
  --mw-accent: #d6a9ca;
  --mw-muted: #b7c0c7;
  --mw-border: rgba(255, 255, 255, .22);
  --mw-surface: rgba(255, 255, 255, .055);
}
@container (max-width: 470px) {
  .model-widget .mw-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 320px) {
  .model-widget .mw-metrics { grid-template-columns: minmax(0, 1fr); }
}
@media print {
  .model-widget .mw-controls,
  .model-widget .mw-actions { display: none; }
  .model-widget .mw-panel { break-inside: avoid; }
}
`;

export function htmlElement(name, className, content) {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

export function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

export function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(decimals);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

export function setOutput(output, value) {
  output.value = value;
  output.textContent = value;
}

export function createBareWidgetRoot(ariaLabel) {
  const root = htmlElement("section", "model-widget");
  if (ariaLabel) {
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", ariaLabel);
  }
  const style = htmlElement("style");
  style.textContent = MODEL_WIDGET_STYLES;
  root.append(style);
  return root;
}

export function createWidgetRoot(title, intro) {
  const id = `model-widget-${++nextWidgetId}`;
  const root = htmlElement("section", "model-widget");
  root.setAttribute("role", "group");
  root.setAttribute("aria-labelledby", `${id}-heading`);
  const style = htmlElement("style");
  style.textContent = MODEL_WIDGET_STYLES;
  const header = htmlElement("header", "mw-header");
  const heading = htmlElement("div", "mw-title", title);
  heading.id = `${id}-heading`;
  heading.setAttribute("role", "heading");
  heading.setAttribute("aria-level", "4");
  const introNode = htmlElement("p", "mw-intro", intro);
  const status = htmlElement("p", "mw-status", "表示を計算しています");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  header.append(heading, introNode, status);
  root.append(style, header);
  return { root, id, status };
}

export function createControls(instance, state, defaults, descriptors, onChange, signal) {
  const fieldset = htmlElement("fieldset", "mw-controls");
  fieldset.append(htmlElement("legend", undefined, "パラメータ"));
  const records = [];
  for (const descriptor of descriptors) {
    const wrapper = htmlElement("div", "mw-control");
    const label = htmlElement("label");
    const labelText = htmlElement("span", undefined, descriptor.label);
    const output = htmlElement("output", undefined,
      formatNumber(state[descriptor.key], descriptor.decimals));
    const input = htmlElement("input");
    const range = htmlElement("div", "mw-range",
      `範囲 ${formatNumber(descriptor.min, descriptor.decimals)}–${formatNumber(descriptor.max, descriptor.decimals)}`);
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
      setOutput(output, formatNumber(input.valueAsNumber, descriptor.decimals));
      onChange();
    }, { signal });
    wrapper.append(label, input, range);
    fieldset.append(wrapper);
    records.push({ descriptor, input, output });
  }
  const actions = htmlElement("div", "mw-actions");
  const reset = htmlElement("button", "mw-reset", "初期値へ戻す");
  reset.type = "button";
  reset.addEventListener("click", () => {
    Object.assign(state, defaults);
    for (const { descriptor, input, output } of records) {
      input.value = String(state[descriptor.key]);
      setOutput(output, formatNumber(state[descriptor.key], descriptor.decimals));
    }
    onChange();
  }, { signal });
  actions.append(reset);
  instance.root.append(fieldset, actions);
  return records;
}

export function createMetric(label) {
  const card = htmlElement("div", "mw-metric");
  const labelNode = htmlElement("p", "mw-metric-label", label);
  const output = htmlElement("output", "mw-metric-value", "—");
  output.setAttribute("aria-label", label);
  card.append(labelNode, output);
  return { card, output };
}

export function createMetrics(definitions) {
  const container = htmlElement("div", "mw-metrics");
  const metrics = {};
  for (const [key, label] of Object.entries(definitions)) {
    metrics[key] = createMetric(label);
    container.append(metrics[key].card);
  }
  return { container, metrics };
}

export function createPanel(title, note) {
  const panel = htmlElement("figure", "mw-panel");
  const caption = htmlElement("figcaption", "mw-panel-title", title);
  const noteNode = htmlElement("p", "mw-panel-note", note);
  const chart = htmlElement("div", "mw-chart");
  panel.append(caption, noteNode, chart);
  return { panel, chart };
}

export function createLegend(entries) {
  const list = htmlElement("ul", "mw-legends");
  list.setAttribute("aria-label", "グラフの凡例");
  for (const [className, label] of entries) {
    const item = htmlElement("li");
    const swatch = htmlElement("span", `mw-swatch ${className}`);
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, document.createTextNode(label));
    list.append(item);
  }
  return list;
}

export function sampleRange(maximum, count = 321, minimum = 0) {
  if (count < 2) return [minimum];
  return Array.from({ length: count }, (_, index) => (
    minimum + (maximum - minimum) * index / (count - 1)
  ));
}

export function paddedDomain(values, { includeZero = true, nonnegative = false } = {}) {
  const finite = values.filter(Number.isFinite);
  if (includeZero) finite.push(0);
  if (finite.length === 0) return [0, 1];
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

function svgText(parent, content, attributes = {}) {
  const node = svgElement("text", attributes);
  node.textContent = content;
  parent.append(node);
  return node;
}

function xTicks(minimum, maximum, width) {
  const intervals = width < 390 ? 3 : 5;
  return Array.from({ length: intervals + 1 }, (_, index) => (
    minimum + (maximum - minimum) * index / intervals
  ));
}

export function createFrame({ id, width, height = 228, xDomain, yDomain, title,
  description, xLabel, yLabel }) {
  const margin = { top: 24, right: 15, bottom: 43, left: 52 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const [xMinimum, xMaximum] = xDomain;
  const [yMinimum, yMaximum] = yDomain;
  const xScale = value => margin.left
    + (value - xMinimum) / (xMaximum - xMinimum) * innerWidth;
  const yScale = value => margin.top
    + (yMaximum - value) / (yMaximum - yMinimum) * innerHeight;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}` });
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", `${id}-title ${id}-desc`);
  const titleNode = svgElement("title", { id: `${id}-title` });
  titleNode.textContent = title;
  const descriptionNode = svgElement("desc", { id: `${id}-desc` });
  descriptionNode.textContent = description;
  const background = svgElement("g");
  const grid = svgElement("g");
  const data = svgElement("g");
  const overlay = svgElement("g");
  svg.append(titleNode, descriptionNode, background, grid, data, overlay);

  for (const tick of xTicks(xMinimum, xMaximum, width)) {
    grid.append(svgElement("line", {
      x1: xScale(tick), x2: xScale(tick), y1: margin.top,
      y2: margin.top + innerHeight, class: "mw-grid",
    }));
    svgText(grid, formatNumber(tick, xMaximum - xMinimum <= 10 ? 1 : 0), {
      x: xScale(tick), y: margin.top + innerHeight + 17, "text-anchor": "middle",
    });
  }
  for (let index = 0; index <= 4; index += 1) {
    const tick = yMinimum + (yMaximum - yMinimum) * index / 4;
    grid.append(svgElement("line", {
      x1: margin.left, x2: margin.left + innerWidth,
      y1: yScale(tick), y2: yScale(tick), class: "mw-grid",
    }));
    svgText(grid, formatNumber(tick, Math.abs(yMaximum - yMinimum) < 20 ? 1 : 0), {
      x: margin.left - 6, y: yScale(tick) + 4, "text-anchor": "end",
    });
  }
  grid.append(svgElement("path", {
    d: `M${margin.left},${margin.top} V${margin.top + innerHeight} H${margin.left + innerWidth}`,
    class: "mw-axis",
  }));
  if (yMinimum < 0 && yMaximum > 0) {
    grid.append(svgElement("line", {
      x1: margin.left, x2: margin.left + innerWidth,
      y1: yScale(0), y2: yScale(0), class: "mw-zero",
    }));
  }
  svgText(grid, yLabel, { x: margin.left, y: 14, class: "mw-axis-title" });
  svgText(grid, xLabel, {
    x: width / 2, y: height - 6, "text-anchor": "middle", class: "mw-axis-title",
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

export function addPath(frame, points, className, predicate) {
  const path = pathData(points, frame, predicate);
  if (path) frame.data.append(svgElement("path", { d: path, class: `mw-line ${className}` }));
}

export function addVerticalLine(frame, x, className = "mw-marker") {
  frame.overlay.append(svgElement("line", {
    x1: frame.xScale(x), x2: frame.xScale(x),
    y1: frame.plotTop, y2: frame.plotBottom, class: className,
  }));
}

export function addHorizontalLine(frame, y, className = "mw-threshold") {
  frame.overlay.append(svgElement("line", {
    x1: frame.xScale(frame.xMinimum), x2: frame.xScale(frame.xMaximum),
    y1: frame.yScale(y), y2: frame.yScale(y), class: className,
  }));
}

export function addCircle(frame, x, y, className = "mw-point", radius = 4.8) {
  frame.overlay.append(svgElement("circle", {
    cx: frame.xScale(x), cy: frame.yScale(y), r: radius, class: className,
  }));
}

export function addDiamond(frame, x, y, className = "mw-point-hollow") {
  const centerX = frame.xScale(x);
  const centerY = frame.yScale(y);
  frame.overlay.append(svgElement("polygon", {
    points: `${centerX},${centerY - 5.5} ${centerX + 5.5},${centerY} ${centerX},${centerY + 5.5} ${centerX - 5.5},${centerY}`,
    class: className,
  }));
}

export function addBoundaryTriangle(frame, x, y) {
  const centerX = frame.xScale(x);
  const centerY = frame.yScale(y);
  const points = x <= frame.xMinimum + 1e-8
    ? `${centerX},${centerY} ${centerX + 9},${centerY - 5} ${centerX + 9},${centerY + 5}`
    : `${centerX},${centerY} ${centerX - 9},${centerY - 5} ${centerX - 9},${centerY + 5}`;
  frame.overlay.append(svgElement("polygon", { points, class: "mw-point" }));
}

export function mountResponsive(host, draw, cleanups, minimumWidth = 270) {
  let previousWidth = 0;
  const redraw = () => {
    const measured = host.getBoundingClientRect().width;
    const width = Math.max(minimumWidth, Math.round(measured || 680));
    previousWidth = width;
    draw(width);
  };
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(entries => {
      const width = Math.max(minimumWidth,
        Math.round(entries[0].contentRect.width || 680));
      if (width !== previousWidth) redraw();
    });
    observer.observe(host);
    cleanups.push(() => observer.disconnect());
  } else {
    window.addEventListener("resize", redraw);
    cleanups.push(() => window.removeEventListener("resize", redraw));
  }
  redraw();
  return redraw;
}
