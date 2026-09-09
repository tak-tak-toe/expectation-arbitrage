import {
  DEFAULT_TWO_TASK_PARAMETERS,
  DEADLINE,
  Q_MINIMUM,
  qualityAtCalendarTime,
  expectationAtCalendarTime,
} from "./model.js";
import { optimizeTwoTasks } from "./optimizer.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const RECOMPUTE_DELAY = 100;
const TASKS = Object.freeze(["A", "B"]);
let nextWidgetId = 0;

const STYLES = `
.two-task-widget {
  --tto-a: #087e8b;
  --tto-b: #b5571c;
  --tto-accent: #8d647d;
  --tto-muted: #65717a;
  --tto-border: rgba(8, 126, 139, .28);
  --tto-surface: rgba(8, 126, 139, .055);
  --tto-grid: currentColor;
  color: inherit;
  container-type: inline-size;
  font-family: inherit;
  min-width: 0;
}
.two-task-widget * { box-sizing: border-box; }
.two-task-widget .tto-header { display: grid; gap: .45rem; margin: 0 0 1rem; }
.two-task-widget .tto-title { margin: 0; font-size: 1.18rem; font-weight: 700; line-height: 1.35; }
.two-task-widget .tto-intro,
.two-task-widget .tto-note { margin: 0; font-size: .88rem; line-height: 1.55; }
.two-task-widget .tto-facts { display: flex; flex-wrap: wrap; gap: .4rem; margin: 0; }
.two-task-widget .tto-fact,
.two-task-widget .tto-status {
  border: 1px solid var(--tto-border);
  border-radius: 999px;
  background: var(--tto-surface);
  padding: .22rem .55rem;
  font-size: .8rem;
  line-height: 1.35;
}
.two-task-widget .tto-status { justify-self: start; margin: .15rem 0 0; font-weight: 650; }
.two-task-widget .tto-status[data-state="ready"] { border-color: var(--tto-a); }
.two-task-widget .tto-status[data-state="outside"] { border-color: var(--tto-b); }
.two-task-widget .tto-status[data-state="error"] { border-color: var(--tto-accent); }
.two-task-widget .tto-control-form { margin: 0 0 1.1rem; }
.two-task-widget .tto-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: .75rem;
}
.two-task-widget .tto-control-group {
  min-width: 0;
  margin: 0;
  padding: .8rem;
  border: 1px solid var(--tto-border);
  border-radius: .4rem;
  background: var(--tto-surface);
}
.two-task-widget .tto-control-group legend { padding: 0 .25rem; font-weight: 700; }
.two-task-widget .tto-group-note { margin: 0 0 .65rem; font-size: .78rem; line-height: 1.45; }
.two-task-widget .tto-control + .tto-control { margin-top: .62rem; }
.two-task-widget .tto-control label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: .2rem .65rem;
  margin: 0 0 .12rem;
  font-size: .84rem;
  line-height: 1.4;
}
.two-task-widget .tto-control output { font-variant-numeric: tabular-nums; font-weight: 700; }
.two-task-widget .tto-control input[type="range"] {
  display: block;
  width: 100%;
  margin: .2rem 0 .05rem;
  accent-color: var(--tto-a);
}
.two-task-widget .tto-control input[type="range"]:focus-visible,
.two-task-widget .tto-reset:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.two-task-widget .tto-range { color: var(--tto-muted); font-size: .72rem; }
.two-task-widget .tto-actions { display: flex; justify-content: flex-end; margin-top: .65rem; }
.two-task-widget .tto-reset {
  border: 1px solid var(--tto-border);
  border-radius: .35rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: .8rem;
  padding: .38rem .65rem;
}
.two-task-widget .tto-reset:hover { background: var(--tto-surface); }
.two-task-widget .tto-section { min-width: 0; margin: 1.2rem 0; }
.two-task-widget .tto-section-title { margin: 0 0 .55rem; font-size: 1rem; line-height: 1.35; }
.two-task-widget .tto-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .65rem;
}
.two-task-widget .tto-metric {
  min-width: 0;
  padding: .72rem;
  border: 1px solid var(--tto-border);
  border-radius: .38rem;
  background: var(--tto-surface);
}
.two-task-widget .tto-metric-label { margin: 0 0 .18rem; font-size: .76rem; line-height: 1.35; }
.two-task-widget .tto-metric-value {
  display: block;
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.28;
  overflow-wrap: anywhere;
}
.two-task-widget .tto-metric--order .tto-metric-value { font-size: .96rem; line-height: 1.45; }
.two-task-widget .tto-diagnostics {
  border-left: 3px solid var(--tto-a);
  background: var(--tto-surface);
  margin: .7rem 0 0;
  padding: .48rem .7rem;
  font-size: .82rem;
  line-height: 1.5;
}
.two-task-widget .tto-diagnostics[data-state="outside"] { border-left-color: var(--tto-b); }
.two-task-widget .tto-figure { min-width: 0; margin: 0; }
.two-task-widget .tto-figure + .tto-figure { margin-top: .9rem; }
.two-task-widget .tto-caption { margin: 0 0 .35rem; font-size: .86rem; font-weight: 650; line-height: 1.4; }
.two-task-widget .tto-chart-host { min-width: 0; }
.two-task-widget svg { display: block; width: 100%; height: auto; overflow: visible; font-family: inherit; }
.two-task-widget svg text { fill: currentColor; font-size: 11px; }
.two-task-widget svg .tto-axis-title { font-size: 12px; font-weight: 600; }
.two-task-widget .tto-axis { fill: none; stroke: currentColor; stroke-width: 1; opacity: .58; }
.two-task-widget .tto-grid { stroke: var(--tto-grid); stroke-width: 1; opacity: .12; }
.two-task-widget .tto-quality,
.two-task-widget .tto-expectation { fill: none; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.two-task-widget .tto-quality { stroke-width: 2.7; }
.two-task-widget .tto-quality-a { stroke: var(--tto-a); }
.two-task-widget .tto-quality-b { stroke: var(--tto-b); }
.two-task-widget .tto-expectation { stroke: var(--tto-accent); stroke-width: 2.2; stroke-dasharray: 7 4; }
.two-task-widget .tto-threshold { stroke: currentColor; stroke-width: 1.5; stroke-dasharray: 8 3 2 3; opacity: .58; }
.two-task-widget .tto-active-a { fill: var(--tto-a); opacity: .07; }
.two-task-widget .tto-active-b { fill: var(--tto-b); opacity: .07; }
.two-task-widget .tto-point { vector-effect: non-scaling-stroke; }
.two-task-widget .tto-point-a { fill: var(--tto-a); stroke: var(--tto-a); }
.two-task-widget .tto-point-b { fill: var(--tto-b); stroke: var(--tto-b); }
.two-task-widget .tto-review-point { fill: transparent; stroke-width: 2.2; }
.two-task-widget .tto-final-point { stroke: Canvas; stroke-width: 1.4; }
.two-task-widget .tto-phase-a { fill: var(--tto-a); }
.two-task-widget .tto-phase-b { fill: var(--tto-b); }
.two-task-widget .tto-idle { fill: currentColor; opacity: .13; }
.two-task-widget svg .tto-phase-label { fill: white; font-size: 11px; font-weight: 750; }
.two-task-widget .tto-event-line { stroke-width: 1.2; stroke-dasharray: 2 3; opacity: .76; }
.two-task-widget .tto-event-a { fill: var(--tto-a); stroke: var(--tto-a); }
.two-task-widget .tto-event-b { fill: var(--tto-b); stroke: var(--tto-b); }
.two-task-widget .tto-empty-label { font-size: 12px; font-weight: 650; }
.two-task-widget .tto-legends {
  display: flex;
  flex-wrap: wrap;
  gap: .32rem .85rem;
  margin: .35rem 0 0;
  padding: 0;
  list-style: none;
  font-size: .76rem;
  line-height: 1.4;
}
.two-task-widget .tto-legends li { display: flex; align-items: center; gap: .35rem; }
.two-task-widget .tto-swatch { display: inline-block; width: 1.55rem; flex: 0 0 1.55rem; border-top: 3px solid currentColor; }
.two-task-widget .tto-swatch-a { color: var(--tto-a); }
.two-task-widget .tto-swatch-b { color: var(--tto-b); }
.two-task-widget .tto-swatch-expectation { color: var(--tto-accent); border-top-style: dashed; }
.two-task-widget .tto-swatch-threshold { opacity: .6; border-top-style: dotted; }
.two-task-widget .tto-swatch-active { width: 1rem; flex-basis: 1rem; height: .75rem; border: 1px solid currentColor; background: var(--tto-surface); }
.two-task-widget .tto-swatch-stage2 {
  width: 1rem;
  flex-basis: 1rem;
  height: .75rem;
  border: 1px solid currentColor;
  background: repeating-linear-gradient(135deg, transparent 0 3px, currentColor 3px 4px);
  opacity: .55;
}
.two-task-widget .tto-chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.two-task-widget .tto-table-wrap { min-width: 0; }
.two-task-widget .tto-table { width: 100%; border-collapse: collapse; font-size: .78rem; font-variant-numeric: tabular-nums; }
.two-task-widget .tto-table caption { padding: 0 0 .45rem; text-align: left; font-weight: 650; }
.two-task-widget .tto-table th,
.two-task-widget .tto-table td { border-bottom: 1px solid var(--tto-border); padding: .48rem .38rem; text-align: right; vertical-align: top; }
.two-task-widget .tto-table thead th { background: var(--tto-surface); font-weight: 650; line-height: 1.35; }
.two-task-widget .tto-table th:first-child,
.two-task-widget .tto-table td:first-child { text-align: left; }
.two-task-widget .tto-table tbody th { color: inherit; font-weight: 750; }
.two-task-widget .tto-table-empty { padding: 1rem !important; text-align: center !important; }
.quarto-dark .two-task-widget,
[data-bs-theme="dark"] .two-task-widget {
  --tto-a: #62cbd3;
  --tto-b: #efa069;
  --tto-accent: #d6a9ca;
  --tto-muted: #b6c0c7;
  --tto-border: rgba(255, 255, 255, .22);
  --tto-surface: rgba(255, 255, 255, .055);
}
@container (max-width: 760px) {
  .two-task-widget .tto-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .two-task-widget .tto-chart-grid { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 640px) {
  .two-task-widget .tto-table,
  .two-task-widget .tto-table tbody,
  .two-task-widget .tto-table tr,
  .two-task-widget .tto-table th,
  .two-task-widget .tto-table td { display: block; width: 100%; }
  .two-task-widget .tto-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .two-task-widget .tto-table tbody tr { margin: 0 0 .7rem; border: 1px solid var(--tto-border); border-radius: .38rem; overflow: hidden; }
  .two-task-widget .tto-table tbody th { padding: .55rem .65rem; background: var(--tto-surface); }
  .two-task-widget .tto-table tbody td {
    display: grid;
    grid-template-columns: minmax(8.5rem, 1fr) auto;
    gap: .7rem;
    padding: .42rem .65rem;
    text-align: right;
  }
  .two-task-widget .tto-table tbody td::before { content: attr(data-label); text-align: left; font-weight: 600; }
  .two-task-widget .tto-table-empty::before { content: none !important; }
}
@container (max-width: 430px) {
  .two-task-widget .tto-metrics { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .two-task-widget .tto-chart-grid { grid-template-columns: minmax(0, 1fr); }
}
@media print {
  .two-task-widget .tto-control-form,
  .two-task-widget .tto-reset { display: none; }
  .two-task-widget .tto-chart-grid { grid-template-columns: minmax(0, 1fr); }
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

function cloneDefaults() {
  return {
    worker: { ...DEFAULT_TWO_TASK_PARAMETERS.worker },
    managers: {
      A: { ...DEFAULT_TWO_TASK_PARAMETERS.managers.A },
      B: { ...DEFAULT_TWO_TASK_PARAMETERS.managers.B },
    },
  };
}

function setOutput(output, value) {
  output.value = value;
  output.textContent = value;
}

function addSvgAccessibility(svg, titleId, descriptionId, title, description) {
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", `${titleId} ${descriptionId}`);
  const titleNode = svgElement("title", { id: titleId });
  titleNode.textContent = title;
  const descriptionNode = svgElement("desc", { id: descriptionId });
  descriptionNode.textContent = description;
  svg.append(titleNode, descriptionNode);
}

function horizontalTicks(width) {
  return width < 360 ? [0, 10, 20, DEADLINE] : [0, 5, 10, 15, 20, DEADLINE];
}

function linePath(points, xScale, yScale) {
  return points.map(({ x, y }, index) => (
    `${index === 0 ? "M" : "L"}${xScale(x).toFixed(2)},${yScale(y).toFixed(2)}`
  )).join(" ");
}

function createLegend(entries) {
  const legend = htmlElement("ul", "tto-legends");
  legend.setAttribute("aria-label", "図の凡例");
  for (const { className, label } of entries) {
    const item = htmlElement("li");
    const swatch = htmlElement("span", `tto-swatch ${className}`);
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, document.createTextNode(label));
    legend.append(item);
  }
  return legend;
}

function createMetric(label, extraClass = "") {
  const card = htmlElement("div", `tto-metric ${extraClass}`.trim());
  const labelNode = htmlElement("p", "tto-metric-label", label);
  const output = htmlElement("output", "tto-metric-value", "—");
  output.setAttribute("aria-label", label);
  card.append(labelNode, output);
  return { card, output };
}

function createControl(panelId, descriptor, value, signal, onInput) {
  const wrapper = htmlElement("div", "tto-control");
  const label = htmlElement("label");
  const labelText = htmlElement("span", undefined, descriptor.label);
  const output = htmlElement("output", undefined, format(value, descriptor.decimals));
  const input = htmlElement("input");
  const range = htmlElement("div", "tto-range",
    `範囲 ${format(descriptor.min, descriptor.decimals)}–${format(descriptor.max, descriptor.decimals)}`);
  input.id = `${panelId}-${descriptor.id}`;
  input.type = "range";
  input.min = String(descriptor.min);
  input.max = String(descriptor.max);
  input.step = String(descriptor.step);
  input.value = String(value);
  label.htmlFor = input.id;
  output.setAttribute("for", input.id);
  label.append(labelText, output);
  input.addEventListener("input", () => {
    setOutput(output, format(input.valueAsNumber, descriptor.decimals));
    onInput(input.valueAsNumber);
  }, { signal });
  wrapper.append(label, input, range);
  return { wrapper, input, output, descriptor };
}

function drawTimeline(host, instanceId, result, width) {
  const height = width < 390 ? 180 : 166;
  const margin = { top: 42, right: 14, bottom: 39, left: 31 };
  const innerWidth = width - margin.left - margin.right;
  const bandTop = 52;
  const bandHeight = 40;
  const axisY = height - margin.bottom;
  const xScale = value => margin.left + value / DEADLINE * innerWidth;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}` });
  const feasible = Boolean(result?.feasible);
  const description = feasible
    ? `作業順序は${result.best.orderLabel}。全作業は時刻${format(result.best.totalWork)}で終了し、期限までの余白は${format(Math.max(0, result.best.idleTime))}です。`
    : `時刻0から${DEADLINE}までの共通締切を示します。現在の条件は実行可能領域外です。`;
  addSvgAccessibility(svg, `${instanceId}-timeline-title`, `${instanceId}-timeline-desc`,
    "2タスクの作業タイムライン", description);

  for (const tick of horizontalTicks(width)) {
    svg.append(svgElement("line", {
      x1: xScale(tick), x2: xScale(tick), y1: bandTop, y2: axisY,
      class: "tto-grid",
    }));
    svgText(svg, tick, { x: xScale(tick), y: axisY + 18, "text-anchor": "middle" });
  }
  svg.append(svgElement("line", {
    x1: xScale(0), x2: xScale(DEADLINE), y1: axisY, y2: axisY, class: "tto-axis",
  }));
  svgText(svg, "カレンダー時刻 t", {
    x: width / 2, y: height - 7, "text-anchor": "middle", class: "tto-axis-title",
  });

  if (!feasible) {
    svg.append(svgElement("rect", {
      x: xScale(0), y: bandTop, width: innerWidth, height: bandHeight,
      rx: 3, class: "tto-idle",
    }));
    svgText(svg, "実行可能領域外（infeasible）", {
      x: width / 2, y: bandTop + bandHeight / 2 + 4,
      "text-anchor": "middle", class: "tto-empty-label",
    });
    host.replaceChildren(svg);
    return;
  }

  for (const phase of result.best.phases) {
    const start = xScale(phase.start);
    const end = xScale(phase.end);
    const rect = svgElement("rect", {
      x: start,
      y: bandTop,
      width: Math.max(0, end - start),
      height: bandHeight,
      class: `tto-phase-${phase.task.toLowerCase()}`,
    });
    const title = svgElement("title");
    title.textContent = `${phase.phase}: ${format(phase.start)}–${format(phase.end)}（${format(phase.duration)}時間）`;
    rect.append(title);
    svg.append(rect);
    if (phase.stage === 2) {
      const spacing = 7;
      const clipId = `${instanceId}-${phase.phase}-clip`;
      const defs = svgElement("defs");
      const clip = svgElement("clipPath", { id: clipId });
      clip.append(svgElement("rect", {
        x: start, y: bandTop, width: Math.max(0, end - start), height: bandHeight,
      }));
      defs.append(clip);
      svg.append(defs);
      for (let x = start - bandHeight; x < end + bandHeight; x += spacing) {
        svg.append(svgElement("line", {
          x1: x, y1: bandTop + bandHeight, x2: x + bandHeight, y2: bandTop,
          stroke: "white", "stroke-opacity": .32, "stroke-width": 1.2,
          "clip-path": `url(#${clipId})`,
        }));
      }
    }
    if (end - start >= 25) {
      svgText(svg, phase.phase, {
        x: (start + end) / 2,
        y: bandTop + bandHeight / 2 + 4,
        "text-anchor": "middle",
        class: "tto-phase-label",
      });
    }
  }

  if (result.best.idleTime > 0) {
    const start = xScale(result.best.totalWork);
    svg.append(svgElement("rect", {
      x: start, y: bandTop, width: Math.max(0, xScale(DEADLINE) - start),
      height: bandHeight, class: "tto-idle",
    }));
    if (xScale(DEADLINE) - start >= 29) {
      svgText(svg, "idle", {
        x: (start + xScale(DEADLINE)) / 2,
        y: bandTop + bandHeight / 2 + 4,
        "text-anchor": "middle",
      });
    }
  }

  for (const task of TASKS) {
    const taskResult = result.best.tasks[task];
    const isTaskA = task === "A";
    const markerClass = `tto-event-${task.toLowerCase()}`;
    const events = [
      { time: taskResult.tau, label: `R${task}`, review: true },
      { time: taskResult.completionTime, label: `F${task}`, review: false },
    ];
    for (const event of events) {
      const x = xScale(event.time);
      const markerY = isTaskA ? bandTop - 12 : bandTop + bandHeight + 12;
      svg.append(svgElement("line", {
        x1: x, x2: x,
        y1: isTaskA ? markerY + 5 : bandTop + bandHeight,
        y2: isTaskA ? bandTop : markerY - 5,
        class: `tto-event-line ${markerClass}`,
      }));
      if (event.review) {
        svg.append(svgElement("polygon", {
          points: `${x},${markerY - 5} ${x + 5},${markerY} ${x},${markerY + 5} ${x - 5},${markerY}`,
          class: markerClass,
        }));
      } else {
        svg.append(svgElement("circle", { cx: x, cy: markerY, r: 4.7, class: markerClass }));
      }
      svgText(svg, event.label, {
        x,
        y: isTaskA ? markerY - 8 : markerY + 15,
        "text-anchor": "middle",
        class: markerClass,
      });
    }
  }
  host.replaceChildren(svg);
}

function chartMaximum(result, parameters) {
  const values = [Q_MINIMUM, 120];
  for (const task of TASKS) {
    values.push(expectationAtCalendarTime(task, DEADLINE, parameters));
    if (result?.feasible) values.push(result.best.tasks[task].finalQuality);
  }
  return Math.max(120, Math.ceil(Math.max(...values) / 20) * 20);
}

function drawTaskChart(host, instanceId, task, result, parameters, maximum, width) {
  const height = width < 380 ? 286 : 270;
  const margin = { top: 29, right: 15, bottom: 47, left: 43 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xScale = value => margin.left + value / DEADLINE * innerWidth;
  const yScale = value => margin.top + (1 - value / maximum) * innerHeight;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}` });
  const feasible = Boolean(result?.feasible);
  const taskResult = feasible ? result.best.tasks[task] : null;
  const description = feasible
    ? `Task ${task}の品質は担当phaseで上昇し、もう一方のタスクのphaseで同じ水準を保ちます。中間レビューは時刻${format(taskResult.tau)}、最終レビューは時刻${format(taskResult.completionTime)}、最終品質は${format(taskResult.finalQuality)}です。期待値はカレンダー時刻に沿って上昇します。`
    : `Task ${task}の期待値と最低品質100を時刻0から${DEADLINE}まで表示します。現在の条件は実行可能領域外です。`;
  addSvgAccessibility(svg, `${instanceId}-${task}-title`, `${instanceId}-${task}-desc`,
    `Task ${task}の品質と期待値`, description);

  if (feasible) {
    for (const phase of result.best.phases.filter(item => item.task === task)) {
      svg.append(svgElement("rect", {
        x: xScale(phase.start),
        y: margin.top,
        width: Math.max(0, xScale(phase.end) - xScale(phase.start)),
        height: innerHeight,
        class: `tto-active-${task.toLowerCase()}`,
      }));
      if (xScale(phase.end) - xScale(phase.start) > 31) {
        svgText(svg, phase.phase, {
          x: (xScale(phase.start) + xScale(phase.end)) / 2,
          y: margin.top + 13,
          "text-anchor": "middle",
        });
      }
    }
  }

  for (const tick of horizontalTicks(width)) {
    svg.append(svgElement("line", {
      x1: xScale(tick), x2: xScale(tick), y1: margin.top,
      y2: yScale(0), class: "tto-grid",
    }));
    svgText(svg, tick, { x: xScale(tick), y: yScale(0) + 18, "text-anchor": "middle" });
  }
  for (let index = 0; index <= 4; index += 1) {
    const tick = maximum * index / 4;
    svg.append(svgElement("line", {
      x1: xScale(0), x2: xScale(DEADLINE), y1: yScale(tick),
      y2: yScale(tick), class: "tto-grid",
    }));
    svgText(svg, format(tick, 0), {
      x: margin.left - 6, y: yScale(tick) + 4, "text-anchor": "end",
    });
  }
  svg.append(svgElement("path", {
    d: `M${xScale(0)},${yScale(maximum)} V${yScale(0)} H${xScale(DEADLINE)}`,
    class: "tto-axis",
  }));
  svg.append(svgElement("line", {
    x1: xScale(0), x2: xScale(DEADLINE), y1: yScale(Q_MINIMUM),
    y2: yScale(Q_MINIMUM), class: "tto-threshold",
  }));
  svgText(svg, "品質 / 期待値", { x: margin.left, y: 15, class: "tto-axis-title" });
  svgText(svg, "カレンダー時刻 t", {
    x: width / 2, y: height - 7, "text-anchor": "middle", class: "tto-axis-title",
  });

  const expectationPoints = [0, DEADLINE].map(time => ({
    x: time,
    y: expectationAtCalendarTime(task, time, parameters),
  }));
  svg.append(svgElement("path", {
    d: linePath(expectationPoints, xScale, yScale), class: "tto-expectation",
  }));

  if (feasible) {
    const sampledTimes = new Set([0, DEADLINE]);
    for (let index = 0; index <= 250; index += 1) {
      sampledTimes.add(DEADLINE * index / 250);
    }
    for (const phase of result.best.phases) {
      sampledTimes.add(phase.start);
      sampledTimes.add(phase.end);
    }
    const qualityPoints = [...sampledTimes].sort((left, right) => left - right).map(time => ({
      x: time,
      y: qualityAtCalendarTime(result.best, task, time, parameters),
    }));
    svg.append(svgElement("path", {
      d: linePath(qualityPoints, xScale, yScale),
      class: `tto-quality tto-quality-${task.toLowerCase()}`,
    }));

    const pointClass = `tto-point tto-point-${task.toLowerCase()}`;
    const reviewX = xScale(taskResult.tau);
    const reviewY = yScale(taskResult.reviewQuality);
    svg.append(svgElement("polygon", {
      points: `${reviewX},${reviewY - 5} ${reviewX + 5},${reviewY} ${reviewX},${reviewY + 5} ${reviewX - 5},${reviewY}`,
      class: `${pointClass} tto-review-point`,
    }));
    svg.append(svgElement("circle", {
      cx: xScale(taskResult.completionTime),
      cy: yScale(taskResult.finalQuality),
      r: 4.8,
      class: `${pointClass} tto-final-point`,
    }));
  }
  host.replaceChildren(svg);
}

function replaceResultRows(tbody, result, state = "result") {
  tbody.replaceChildren();
  if (state === "working" || state === "error") {
    const row = htmlElement("tr");
    const message = state === "working" ? "近似解を計算しています" : "計算エラー";
    const cell = htmlElement("td", "tto-table-empty", message);
    cell.colSpan = 8;
    row.append(cell);
    tbody.append(row);
    return;
  }
  if (!result?.feasible) {
    const row = htmlElement("tr");
    const cell = htmlElement("td", "tto-table-empty", "実行可能領域外（infeasible）");
    cell.colSpan = 8;
    row.append(cell);
    tbody.append(row);
    return;
  }
  const columns = [
    ["レビュー前作業 x", "x"],
    ["レビュー後作業 y", "y"],
    ["中間レビュー τ", "tau"],
    ["最終レビュー c", "completionTime"],
    ["中間品質", "reviewQuality"],
    ["最終品質 Q", "finalQuality"],
    ["評価 V", "evaluation"],
  ];
  for (const task of TASKS) {
    const row = htmlElement("tr");
    const heading = htmlElement("th", undefined, `Task ${task}`);
    heading.scope = "row";
    row.append(heading);
    for (const [label, key] of columns) {
      const cell = htmlElement("td", undefined, format(result.best.tasks[task][key]));
      cell.dataset.label = label;
      row.append(cell);
    }
    tbody.append(row);
  }
}

function diagnosticText(result) {
  if (result.feasible) {
    return `6つの作業順序のうち${result.diagnostics.feasibleOrders}通りが品質・時間制約を達成しました。近似探索では${result.diagnostics.totalEvaluations.toLocaleString("ja-JP")}件の候補を評価しました。`;
  }
  const gap = result.best.violation;
  return `探索候補の最小制約差：Task Aの品質基準まで${format(gap.qualityA)}、Task Bの品質基準まで${format(gap.qualityB)}、締切超過${format(gap.time)}、正作業量条件${format(gap.positivity, 0)} phase。`;
}

/** Render the deterministic, browser-only optimizer for the two-task chapter. */
export function renderTwoTaskOptimizer(initialParameters = DEFAULT_TWO_TASK_PARAMETERS) {
  const instanceId = `two-task-optimizer-${++nextWidgetId}`;
  const root = htmlElement("section", "two-task-widget");
  root.setAttribute("role", "group");
  root.setAttribute("aria-labelledby", `${instanceId}-heading`);
  root.setAttribute("aria-busy", "true");
  const style = htmlElement("style");
  style.textContent = STYLES;

  const header = htmlElement("header", "tto-header");
  const title = htmlElement("div", "tto-title", "2タスクのレビュータイミングと作業順序");
  title.id = `${instanceId}-heading`;
  title.setAttribute("role", "heading");
  title.setAttribute("aria-level", "3");
  const intro = htmlElement("p", "tto-intro",
    "スライダーに応じて6つの作業順序を比較し、平均評価が最大となる近似解を更新します。");
  const invarianceNote = htmlElement("p", "tto-note",
    "初期期待値 a_A・a_B は評価水準を平行移動させ、選ばれる作業順序と各フェーズ時間を保ちます。");
  const facts = htmlElement("p", "tto-facts");
  facts.append(
    htmlElement("span", "tto-fact", `共通締切 T = ${DEADLINE}`),
    htmlElement("span", "tto-fact", `最低品質 Qmin = ${Q_MINIMUM}`),
    htmlElement("span", "tto-fact", "中間レビュー 各1回"),
  );
  const status = htmlElement("p", "tto-status", "近似解を計算しています");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  status.dataset.state = "working";
  header.append(title, intro, invarianceNote, facts, status);

  const controller = new AbortController();
  const cleanups = [];
  let disposed = false;
  let debounceTimer;
  let revision = 0;
  let parameters = cloneDefaults();
  parameters.worker = { ...parameters.worker, ...(initialParameters.worker ?? {}) };
  parameters.managers.A = {
    ...parameters.managers.A,
    ...(initialParameters.managers?.A ?? {}),
  };
  parameters.managers.B = {
    ...parameters.managers.B,
    ...(initialParameters.managers?.B ?? {}),
  };

  const form = htmlElement("form", "tto-control-form");
  form.addEventListener("submit", event => event.preventDefault(), { signal: controller.signal });
  const controlsGrid = htmlElement("div", "tto-controls");
  const controlRecords = [];
  const groups = [
    {
      legend: "作業者",
      note: "両タスクが共有する品質曲線のパラメータです。",
      descriptors: [
        { id: "qbar", scope: "worker", key: "qbar", label: "基準品質の上限 q̄", min: 55, max: 100, step: 1, decimals: 0 },
        { id: "k", scope: "worker", key: "k", label: "基礎的な改善速度 k", min: .1, max: .8, step: .05, decimals: 2 },
        { id: "h", scope: "worker", key: "h", label: "レビューの成熟尺度 h", min: .5, max: 8, step: .25, decimals: 2 },
      ],
    },
    {
      legend: "Manager A",
      note: "期待値は e_A(t) = a_A + b_A t です。",
      descriptors: [
        { id: "a-a", scope: "manager", task: "A", key: "a", label: "初期期待値 a_A", min: 0, max: 80, step: 1, decimals: 0 },
        { id: "b-a", scope: "manager", task: "A", key: "b", label: "期待上昇率 b_A", min: 0, max: 15, step: .5, decimals: 1 },
      ],
    },
    {
      legend: "Manager B",
      note: "期待値は e_B(t) = a_B + b_B t です。",
      descriptors: [
        { id: "a-b", scope: "manager", task: "B", key: "a", label: "初期期待値 a_B", min: 0, max: 80, step: 1, decimals: 0 },
        { id: "b-b", scope: "manager", task: "B", key: "b", label: "期待上昇率 b_B", min: 0, max: 15, step: .5, decimals: 1 },
      ],
    },
  ];

  const valueFor = descriptor => descriptor.scope === "worker"
    ? parameters.worker[descriptor.key]
    : parameters.managers[descriptor.task][descriptor.key];
  const updateParameter = (descriptor, value) => {
    if (descriptor.scope === "worker") {
      parameters = { ...parameters, worker: { ...parameters.worker, [descriptor.key]: value } };
    } else {
      parameters = {
        ...parameters,
        managers: {
          ...parameters.managers,
          [descriptor.task]: {
            ...parameters.managers[descriptor.task],
            [descriptor.key]: value,
          },
        },
      };
    }
  };

  let scheduleOptimization = () => {};
  for (const group of groups) {
    const fieldset = htmlElement("fieldset", "tto-control-group");
    const legend = htmlElement("legend", undefined, group.legend);
    const note = htmlElement("p", "tto-group-note", group.note);
    fieldset.append(legend, note);
    for (const descriptor of group.descriptors) {
      const control = createControl(instanceId, descriptor, valueFor(descriptor),
        controller.signal, value => {
          updateParameter(descriptor, value);
          scheduleOptimization();
        });
      controlRecords.push(control);
      fieldset.append(control.wrapper);
    }
    controlsGrid.append(fieldset);
  }
  const actions = htmlElement("div", "tto-actions");
  const resetButton = htmlElement("button", "tto-reset", "初期値へ戻す");
  resetButton.type = "button";
  actions.append(resetButton);
  form.append(controlsGrid, actions);

  const summarySection = htmlElement("section", "tto-section");
  const summaryHeading = htmlElement("h4", "tto-section-title", "最適化サマリ");
  const metrics = htmlElement("div", "tto-metrics");
  const meanMetric = createMetric("平均評価");
  const finishMetric = createMetric("作業終了時刻");
  const idleMetric = createMetric("期限までの余白");
  const orderMetric = createMetric("作業順序", "tto-metric--order");
  metrics.append(meanMetric.card, finishMetric.card, idleMetric.card, orderMetric.card);
  const diagnostics = htmlElement("div", "tto-diagnostics", "計算を開始します。");
  summarySection.append(summaryHeading, metrics, diagnostics);

  const timelineSection = htmlElement("section", "tto-section");
  const timelineFigure = htmlElement("figure", "tto-figure");
  const timelineCaption = htmlElement("figcaption", "tto-caption", "最適作業スケジュール");
  const timelineHost = htmlElement("div", "tto-chart-host");
  timelineFigure.append(timelineCaption, timelineHost,
    createLegend([
      { className: "tto-swatch-a", label: "Task A" },
      { className: "tto-swatch-b", label: "Task B" },
      { className: "tto-swatch-stage2", label: "斜線：レビュー後phase" },
    ]));
  timelineFigure.append(htmlElement("p", "tto-note",
    "Rは中間レビュー、Fは最終レビュー、斜線はレビュー後phaseを表します。"));
  timelineSection.append(timelineFigure);

  const chartsSection = htmlElement("section", "tto-section");
  const chartsHeading = htmlElement("h4", "tto-section-title", "カレンダー時刻上の品質と期待値");
  const chartGrid = htmlElement("div", "tto-chart-grid");
  const chartHosts = {};
  for (const task of TASKS) {
    const figure = htmlElement("figure", "tto-figure");
    const caption = htmlElement("figcaption", "tto-caption", `Task ${task}`);
    const host = htmlElement("div", "tto-chart-host");
    chartHosts[task] = host;
    figure.append(caption, host,
      createLegend([
        { className: `tto-swatch-${task.toLowerCase()}`, label: `Task ${task}の品質` },
        { className: "tto-swatch-expectation", label: "マネージャー期待値" },
        { className: "tto-swatch-threshold", label: `最低品質 ${Q_MINIMUM}` },
        { className: "tto-swatch-active", label: "品質が上昇するphase" },
      ]));
    chartGrid.append(figure);
  }
  const chartNote = htmlElement("p", "tto-note",
    "色付きの区間で各タスクの品質が上昇し、もう一方のタスクの区間では同じ水準を保ちます。期待値はカレンダー時刻に沿って上昇します。");
  chartsSection.append(chartsHeading, chartGrid, chartNote);

  const tableSection = htmlElement("section", "tto-section");
  const tableHeading = htmlElement("h4", "tto-section-title", "タスク別の数値");
  const tableWrap = htmlElement("div", "tto-table-wrap");
  const table = htmlElement("table", "tto-table");
  const caption = htmlElement("caption", undefined, "レビュー時刻・品質・評価");
  const thead = htmlElement("thead");
  const headerRow = htmlElement("tr");
  for (const headingText of [
    "Task", "レビュー前作業 x", "レビュー後作業 y", "中間レビュー τ",
    "最終レビュー c", "中間品質", "最終品質 Q", "評価 V",
  ]) {
    const heading = htmlElement("th", undefined, headingText);
    heading.scope = "col";
    headerRow.append(heading);
  }
  thead.append(headerRow);
  const tbody = htmlElement("tbody");
  table.append(caption, thead, tbody);
  tableWrap.append(table);
  tableSection.append(tableHeading, tableWrap);

  const footerNote = htmlElement("p", "tto-note",
    "決定的な乱数系列を使う近似探索により、同じ入力には同じ結果が対応します。対象は2タスクで、各タスクの中間レビューは1回です。");
  root.append(style, header, form, summarySection, timelineSection, chartsSection,
    tableSection, footerNote);

  let latestResult = null;
  const redrawers = [];
  const installResponsiveDrawing = (host, draw) => {
    let previousWidth = 0;
    const redraw = () => {
      if (disposed) return;
      const measured = host.getBoundingClientRect().width;
      const width = Math.max(260, Math.round(measured || 620));
      previousWidth = width;
      draw(width);
    };
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(entries => {
        const width = Math.max(260, Math.round(entries[0].contentRect.width || 620));
        if (width !== previousWidth) redraw();
      });
      observer.observe(host);
      cleanups.push(() => observer.disconnect());
    } else {
      window.addEventListener("resize", redraw, { signal: controller.signal });
    }
    redrawers.push(redraw);
    redraw();
  };

  installResponsiveDrawing(timelineHost,
    width => drawTimeline(timelineHost, instanceId, latestResult, width));
  for (const task of TASKS) {
    installResponsiveDrawing(chartHosts[task], width => drawTaskChart(
      chartHosts[task], instanceId, task, latestResult, parameters,
      chartMaximum(latestResult, parameters), width,
    ));
  }

  const renderResult = result => {
    latestResult = result;
    if (result.feasible) {
      status.textContent = `実行可能解・${result.diagnostics.feasibleOrders}/6順序`;
      status.dataset.state = "ready";
      setOutput(meanMetric.output, format(result.best.meanEvaluation));
      setOutput(finishMetric.output, format(result.best.totalWork));
      setOutput(idleMetric.output, format(Math.max(0, result.best.idleTime)));
      setOutput(orderMetric.output, result.best.orderLabel);
      diagnostics.dataset.state = "ready";
    } else {
      status.textContent = "実行可能領域外（infeasible）";
      status.dataset.state = "outside";
      for (const output of [meanMetric.output, finishMetric.output, idleMetric.output]) {
        setOutput(output, "—");
      }
      setOutput(orderMetric.output, "infeasible");
      diagnostics.dataset.state = "outside";
    }
    diagnostics.textContent = diagnosticText(result);
    replaceResultRows(tbody, result);
    for (const redraw of redrawers) redraw();
    root.setAttribute("aria-busy", "false");
  };

  const runOptimization = requestedRevision => {
    if (disposed || requestedRevision !== revision) return;
    try {
      const result = optimizeTwoTasks(parameters);
      if (disposed || requestedRevision !== revision) return;
      renderResult(result);
    } catch (error) {
      latestResult = null;
      status.textContent = "計算エラー";
      status.dataset.state = "error";
      diagnostics.textContent = "計算エラーが発生しました。ページの再読み込みで再計算します。";
      diagnostics.dataset.state = "error";
      for (const output of [meanMetric.output, finishMetric.output, idleMetric.output, orderMetric.output]) {
        setOutput(output, "—");
      }
      replaceResultRows(tbody, null, "error");
      for (const redraw of redrawers) redraw();
      root.setAttribute("aria-busy", "false");
      // Keep the exception available to the browser console for implementation checks.
      console.error(error);
    }
  };

  scheduleOptimization = (delay = RECOMPUTE_DELAY) => {
    revision += 1;
    const requestedRevision = revision;
    clearTimeout(debounceTimer);
    root.setAttribute("aria-busy", "true");
    status.textContent = "近似解を計算しています";
    status.dataset.state = "working";
    debounceTimer = setTimeout(() => runOptimization(requestedRevision), delay);
  };

  resetButton.addEventListener("click", () => {
    parameters = cloneDefaults();
    for (const record of controlRecords) {
      const value = valueFor(record.descriptor);
      record.input.value = String(value);
      setOutput(record.output, format(value, record.descriptor.decimals));
    }
    scheduleOptimization();
  }, { signal: controller.signal });

  replaceResultRows(tbody, null, "working");
  scheduleOptimization(0);

  root.dispose = () => {
    if (disposed) return;
    disposed = true;
    revision += 1;
    clearTimeout(debounceTimer);
    controller.abort();
    for (const cleanup of cleanups) cleanup();
  };
  return root;
}
