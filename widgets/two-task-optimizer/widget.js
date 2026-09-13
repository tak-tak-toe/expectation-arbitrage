import {
  DEADLINE,
  Q_MINIMUM,
  DEFAULT_TWO_TASK_PARAMETERS,
} from "./model.js";
import { optimizeTwoTasks } from "./optimizer.js";
import {
  htmlElement,
  svgElement,
  formatNumber,
  setOutput,
  createWidgetRoot,
  createControls,
  createMetrics,
  createPanel,
  mountResponsive,
} from "../review-model/widget-utils.js";

const RECOMPUTE_DELAY = 120;
const DEFAULTS = Object.freeze({
  qInfinity: DEFAULT_TWO_TASK_PARAMETERS.worker.qInfinity,
  kappa: DEFAULT_TWO_TASK_PARAMETERS.worker.kappa,
  rhoBar: DEFAULT_TWO_TASK_PARAMETERS.worker.rhoBar,
  lambda: DEFAULT_TWO_TASK_PARAMETERS.worker.lambda,
  e0A: DEFAULT_TWO_TASK_PARAMETERS.managers.A.e0,
  betaA: DEFAULT_TWO_TASK_PARAMETERS.managers.A.beta,
  e0B: DEFAULT_TWO_TASK_PARAMETERS.managers.B.e0,
  betaB: DEFAULT_TWO_TASK_PARAMETERS.managers.B.beta,
});

const CONTROLS = Object.freeze([
  { key: "qInfinity", label: "品質上限 Q∞", min: 70, max: 100, step: 1, decimals: 0 },
  { key: "kappa", label: "品質改善速度 κ", min: 0.1, max: 0.6, step: 0.01, decimals: 2 },
  { key: "rhoBar", label: "最大レビュー効果 ρ̄", min: 0.1, max: 1, step: 0.05, decimals: 2 },
  { key: "lambda", label: "成熟速度 λ", min: 0.05, max: 0.8, step: 0.01, decimals: 2 },
  { key: "e0A", label: "A の初期要求 E₀,A", min: 0, max: 80, step: 1, decimals: 0 },
  { key: "betaA", label: "A の期待上昇率 βA", min: 0, max: 10, step: 0.25, decimals: 2 },
  { key: "e0B", label: "B の初期要求 E₀,B", min: 0, max: 80, step: 1, decimals: 0 },
  { key: "betaB", label: "B の期待上昇率 βB", min: 0, max: 10, step: 0.25, decimals: 2 },
]);

const EXTRA_STYLES = `
.model-widget .solver-section { min-width: 0; margin: 1rem 0; }
.model-widget .solver-section-title { margin: 0 0 .45rem; font-size: .9rem; font-weight: 700; }
.model-widget .solver-phase-a { fill: var(--mw-primary); }
.model-widget .solver-phase-b { fill: var(--mw-secondary); }
.model-widget .solver-idle { fill: currentColor; opacity: .1; }
.model-widget .solver-phase-label { fill: white; font-size: 11px; font-weight: 750; }
.model-widget .solver-event { stroke: currentColor; stroke-width: 1; stroke-dasharray: 3 3; opacity: .62; }
.model-widget .solver-event-label { font-size: 9px; }
.model-widget .solver-table-wrap { max-width: 100%; overflow-x: auto; }
.model-widget .solver-table { width: 100%; border-collapse: collapse; font-size: .73rem; font-variant-numeric: tabular-nums; }
.model-widget .solver-table caption { padding: 0 0 .35rem; text-align: left; font-weight: 650; }
.model-widget .solver-table th,
.model-widget .solver-table td { border-bottom: 1px solid var(--mw-border); padding: .4rem .34rem; text-align: right; vertical-align: top; }
.model-widget .solver-table thead th { background: var(--mw-surface); font-weight: 650; }
.model-widget .solver-table th:first-child,
.model-widget .solver-table td:first-child { text-align: left; }
.model-widget .solver-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; }
`;

function parameters(state) {
  return {
    worker: {
      qInfinity: state.qInfinity,
      kappa: state.kappa,
      rhoBar: state.rhoBar,
      lambda: state.lambda,
    },
    managers: {
      A: { e0: state.e0A, beta: state.betaA },
      B: { e0: state.e0B, beta: state.betaB },
    },
    taskWeights: { A: 1, B: 1 },
  };
}

function solverStatusLabel(status) {
  const labels = {
    converged_kkt: "収束した局所KKT候補",
    feasible_iteration_limit: "実行可能な決定論的局所候補",
    no_feasible_candidate_found: "最小制約違反の局所候補",
    numerical_failure: "数値計算エラー",
  };
  return labels[status] ?? status;
}

function textNode(parent, content, attributes = {}) {
  const node = svgElement("text", attributes);
  node.textContent = content;
  parent.append(node);
  return node;
}

function drawTimeline(instance, panel, best, width) {
  const height = 150;
  const margin = { left: 35, right: 16, top: 43, bottom: 35 };
  const innerWidth = width - margin.left - margin.right;
  const x = time => margin.left + time / DEADLINE * innerWidth;
  const trackHeight = 36;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}` });
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", `${instance.id}-solver-title ${instance.id}-solver-desc`);
  const title = svgElement("title", { id: `${instance.id}-solver-title` });
  title.textContent = "局所KKT候補の作業スケジュール";
  const description = svgElement("desc", { id: `${instance.id}-solver-desc` });
  description.textContent = `${best.orderLabel}、総作業量${formatNumber(best.totalWork)}、アイドル時間${formatNumber(best.idleTime)}。`;
  svg.append(title, description);

  for (let tick = 0; tick <= DEADLINE; tick += 5) {
    svg.append(svgElement("line", {
      x1: x(tick), x2: x(tick), y1: margin.top - 10,
      y2: margin.top + trackHeight + 11, class: "mw-grid",
    }));
    textNode(svg, String(tick), {
      x: x(tick), y: margin.top + trackHeight + 27, "text-anchor": "middle",
    });
  }
  for (const phase of best.phases) {
    svg.append(svgElement("rect", {
      x: x(phase.start), y: margin.top,
      width: Math.max(1, x(phase.end) - x(phase.start)), height: trackHeight,
      rx: 2, class: phase.task === "A" ? "solver-phase-a" : "solver-phase-b",
    }));
    textNode(svg, phase.phase, {
      x: (x(phase.start) + x(phase.end)) / 2,
      y: margin.top + 23,
      "text-anchor": "middle",
      class: "solver-phase-label",
    });
  }
  if (best.idleTime > 1e-8) {
    svg.append(svgElement("rect", {
      x: x(best.totalWork), y: margin.top,
      width: Math.max(0, x(DEADLINE) - x(best.totalWork)), height: trackHeight,
      class: "solver-idle",
    }));
  }
  for (const task of ["A", "B"]) {
    const item = best.tasks[task];
    for (const [time, label] of [
      [item.tau, `τ${task}`],
      [item.completionTime, `c${task}`],
    ]) {
      svg.append(svgElement("line", {
        x1: x(time), x2: x(time), y1: margin.top - 11,
        y2: margin.top + trackHeight + 10, class: "solver-event",
      }));
      textNode(svg, label, {
        x: x(time), y: margin.top - 16, "text-anchor": "middle",
        class: "solver-event-label",
      });
    }
  }
  textNode(svg, "カレンダー時刻 t", {
    x: width / 2, y: height - 5, "text-anchor": "middle", class: "mw-axis-title",
  });
  panel.chart.replaceChildren(svg);
}

function makeCell(row, value, label) {
  const cell = htmlElement("td", undefined, value);
  if (label) cell.dataset.label = label;
  row.append(cell);
}

function makeHeading(content, scope, className) {
  const heading = htmlElement("th", className, content);
  heading.scope = scope;
  return heading;
}

function renderTaskTable(host, best) {
  const wrapper = htmlElement("div", "solver-table-wrap");
  const table = htmlElement("table", "solver-table");
  table.append(htmlElement("caption", undefined, "タスク別の解と評価"));
  const head = htmlElement("thead");
  const headingRow = htmlElement("tr");
  for (const heading of ["タスク", "x", "y", "τ", "c", "最終品質", "S₁", "S₂", "Ji"]) {
    headingRow.append(makeHeading(heading, "col"));
  }
  head.append(headingRow);
  const body = htmlElement("tbody");
  for (const task of ["A", "B"]) {
    const item = best.tasks[task];
    const row = htmlElement("tr");
    row.append(makeHeading(task, "row"));
    makeCell(row, formatNumber(item.x), "レビュー前作業 x");
    makeCell(row, formatNumber(item.y), "レビュー後作業 y");
    makeCell(row, formatNumber(item.tau), "中間レビュー τ");
    makeCell(row, formatNumber(item.completionTime), "完了 c");
    makeCell(row, formatNumber(item.finalQuality), "最終品質");
    makeCell(row, formatNumber(item.scores.review), "S₁");
    makeCell(row, formatNumber(item.scores.final), "S₂");
    makeCell(row, formatNumber(item.J), "Ji");
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(table);
  host.replaceChildren(wrapper);
}

function renderOrderTable(host, orderResults) {
  const wrapper = htmlElement("div", "solver-table-wrap");
  const table = htmlElement("table", "solver-table");
  table.append(htmlElement("caption", undefined, "6順序の決定論的局所候補"));
  const head = htmlElement("thead");
  const headingRow = htmlElement("tr");
  for (const heading of ["順序 π", "solver status", "Jall", "制約残差", "KKT残差"]) {
    headingRow.append(makeHeading(heading, "col"));
  }
  head.append(headingRow);
  const body = htmlElement("tbody");
  for (const result of orderResults) {
    const row = htmlElement("tr");
    row.append(makeHeading(result.orderLabel, "row", "solver-code"));
    makeCell(row, solverStatusLabel(result.solverStatus), "solver status");
    makeCell(row, formatNumber(result.overallJ), "Jall");
    makeCell(row, formatNumber(result.violation.normalizedMaximum, 6), "制約残差");
    makeCell(row, formatNumber(result.solverDiagnostics?.kktResidual, 6), "KKT残差");
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(table);
  host.replaceChildren(wrapper);
}

function diagnosticParagraphs(best, diagnostics) {
  const solver = best.solverDiagnostics ?? {};
  const multipliers = solver.multipliers ?? {};
  const raw = solver.raw ?? {};
  const lowerBounds = Array.isArray(multipliers.lowerBounds)
    ? multipliers.lowerBounds.map(value => formatNumber(value, 5)).join(", ")
    : "—";
  return [
    htmlElement("p", undefined,
      "方式：6順序を完全列挙し、各順序を structured multi-start projected augmented-Lagrangian + BFGS で探索。連続部分は局所解、global certificate は非付与です。"),
    htmlElement("p", undefined,
      `KKT診断：primal ${formatNumber(solver.primalResidual, 7)}、stationarity ${formatNumber(solver.stationarityResidual, 7)}、dual ${formatNumber(solver.dualResidual, 7)}、complementarity ${formatNumber(solver.complementarityResidual, 7)}。`),
    htmlElement("p", undefined,
      `元スケール診断：最大制約違反 ${formatNumber(raw.primalResidual, 7)}、stationarity ${formatNumber(raw.stationarityResidual, 7)}、complementarity ${formatNumber(raw.complementarityResidual, 7)}。有効制約：${solver.activeConstraints?.join(", ") || "空集合"}。`),
    htmlElement("p", undefined,
      `Shadow price：品質A ${formatNumber(multipliers.qualityA, 5)}、品質B ${formatNumber(multipliers.qualityB, 5)}、締切 μ ${formatNumber(multipliers.deadline, 5)}、下限制約 (${lowerBounds})。`),
    htmlElement("p", undefined,
      `評価回数 ${diagnostics.totalEvaluations}、実行可能順序 ${diagnostics.feasibleOrders}/6、KKT収束順序 ${diagnostics.convergedOrders}/6。`),
  ];
}

export function renderTwoTaskOptimizer(initial = {}) {
  const defaults = { ...DEFAULTS, ...initial };
  const state = { ...defaults };
  const instance = createWidgetRoot(
    "2タスク制約付きNLP",
    `T = ${DEADLINE}、各タスクの完成品質基準 Qmin = ${Q_MINIMUM} のもとで、6順序と連続作業量を解きます。`,
  );
  const extraStyle = htmlElement("style");
  extraStyle.textContent = EXTRA_STYLES;
  instance.root.prepend(extraStyle);
  const controller = new AbortController();
  const cleanups = [() => controller.abort()];
  let disposed = false;
  let timer;
  let revision = 0;
  let width = 680;
  let lastResult = null;

  let schedule = () => {};
  createControls(instance, state, defaults, CONTROLS, () => schedule(), controller.signal);
  const { container: metricContainer, metrics } = createMetrics({
    order: "選択されたフェーズ順序",
    objective: "総合評価 Jall",
    totalWork: "総作業量",
    idleTime: "アイドル時間",
    constraint: "最大制約残差",
    kkt: "KKT残差",
  });
  const plots = htmlElement("div", "mw-plots");
  const timeline = createPanel("選択候補のスケジュール", "中間レビュー τi と完了 ci をカレンダー上に示します。");
  plots.append(timeline.panel);
  const taskSection = htmlElement("section", "solver-section");
  taskSection.append(htmlElement("h4", "solver-section-title", "タスク別評価"));
  const taskTableHost = htmlElement("div");
  taskSection.append(taskTableHost);
  const orderSection = htmlElement("section", "solver-section");
  orderSection.append(htmlElement("h4", "solver-section-title", "順序別候補"));
  const orderTableHost = htmlElement("div");
  orderSection.append(orderTableHost);
  const details = htmlElement("div", "mw-details");
  instance.root.append(metricContainer, plots, taskSection, orderSection, details);

  const renderResult = result => {
    lastResult = result;
    const best = result.best;
    setOutput(metrics.order.output, best.orderLabel);
    setOutput(metrics.objective.output, formatNumber(best.overallJ));
    setOutput(metrics.totalWork.output, formatNumber(best.totalWork));
    setOutput(metrics.idleTime.output, formatNumber(best.idleTime));
    setOutput(metrics.constraint.output,
      formatNumber(best.violation.normalizedMaximum, 7));
    setOutput(metrics.kkt.output,
      formatNumber(best.solverDiagnostics?.kktResidual, 7));
    instance.status.textContent = solverStatusLabel(best.solverStatus);
    instance.status.dataset.state = best.feasible ? "resolved" : "boundary";
    drawTimeline(instance, timeline, best, width);
    renderTaskTable(taskTableHost, best);
    renderOrderTable(orderTableHost, result.orderResults);
    details.replaceChildren(...diagnosticParagraphs(best, result.diagnostics));
    instance.root.setAttribute("aria-busy", "false");
  };

  schedule = (delay = RECOMPUTE_DELAY) => {
    revision += 1;
    const requested = revision;
    clearTimeout(timer);
    instance.root.setAttribute("aria-busy", "true");
    instance.status.textContent = "決定論的局所候補を計算中";
    instance.status.dataset.state = "working";
    timer = setTimeout(() => {
      if (disposed || requested !== revision) return;
      try {
        renderResult(optimizeTwoTasks(parameters(state)));
      } catch (error) {
        instance.status.textContent = "数値計算エラー";
        instance.status.dataset.state = "error";
        details.replaceChildren(htmlElement("p", undefined,
          error instanceof Error ? error.message : String(error)));
        instance.root.setAttribute("aria-busy", "false");
      }
    }, delay);
  };

  mountResponsive(plots, nextWidth => {
    width = nextWidth;
    if (lastResult) drawTimeline(instance, timeline, lastResult.best, width);
  }, cleanups);
  schedule(0);

  instance.root.dispose = () => {
    if (disposed) return;
    disposed = true;
    revision += 1;
    clearTimeout(timer);
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
  return instance.root;
}
