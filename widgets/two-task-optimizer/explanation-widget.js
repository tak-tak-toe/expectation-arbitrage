import { DEADLINE } from "../review-model/model.js";
import {
  PHASE_ORDERS,
  buildSchedule,
  delayCoefficients,
} from "./schedule.js";
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

const DEFAULTS = Object.freeze({
  orderIndex: 1,
  xA: 4,
  yA: 4,
  xB: 4,
  yB: 4,
  betaA: 3,
  betaB: 2,
});

const CONTROLS = Object.freeze([
  { key: "xA", label: "A₁ の作業量 xA", min: 0.5, max: 6, step: 0.5, decimals: 1 },
  { key: "yA", label: "A₂ の作業量 yA", min: 0.5, max: 6, step: 0.5, decimals: 1 },
  { key: "xB", label: "B₁ の作業量 xB", min: 0.5, max: 6, step: 0.5, decimals: 1 },
  { key: "yB", label: "B₂ の作業量 yB", min: 0.5, max: 6, step: 0.5, decimals: 1 },
  { key: "betaA", label: "A の期待上昇率 βA", min: 0, max: 8, step: 0.25, decimals: 2 },
  { key: "betaB", label: "B の期待上昇率 βB", min: 0, max: 8, step: 0.25, decimals: 2 },
]);

const EXTRA_STYLES = `
.model-widget .schedule-order { margin: 0 0 .7rem; }
.model-widget .schedule-order label { display: grid; gap: .3rem; font-size: .82rem; font-weight: 650; }
.model-widget .schedule-order select {
  width: 100%; min-width: 0; padding: .42rem .5rem; border: 1px solid var(--mw-border);
  border-radius: .35rem; background: transparent; color: inherit; font: inherit;
}
.model-widget .schedule-order select:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
.model-widget .schedule-phase-a { fill: var(--mw-primary); }
.model-widget .schedule-phase-b { fill: var(--mw-secondary); }
.model-widget .schedule-idle { fill: currentColor; opacity: .1; }
.model-widget .schedule-phase-label { fill: white; font-size: 11px; font-weight: 750; }
.model-widget .schedule-event { stroke: currentColor; stroke-width: 1; stroke-dasharray: 3 3; opacity: .6; }
`;

function canonicalDurations(state) {
  return [state.xA, state.yA, state.xB, state.yB];
}

function drawTimeline(instance, panel, schedule, width) {
  const height = 126;
  const left = 34;
  const right = 16;
  const trackTop = 34;
  const trackHeight = 36;
  const innerWidth = width - left - right;
  const x = time => left + time / DEADLINE * innerWidth;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}` });
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", `${instance.id}-schedule-title ${instance.id}-schedule-desc`);
  const title = svgElement("title", { id: `${instance.id}-schedule-title` });
  title.textContent = "選択した作業フェーズ順序";
  const description = svgElement("desc", { id: `${instance.id}-schedule-desc` });
  description.textContent = `${schedule.orderLabel}、総作業量${formatNumber(schedule.totalWork)}。`;
  svg.append(title, description);

  for (let tick = 0; tick <= DEADLINE; tick += 5) {
    const line = svgElement("line", {
      x1: x(tick), x2: x(tick), y1: trackTop - 8, y2: trackTop + trackHeight + 8,
      class: "mw-grid",
    });
    const label = svgElement("text", {
      x: x(tick), y: trackTop + trackHeight + 23, "text-anchor": "middle",
    });
    label.textContent = String(tick);
    svg.append(line, label);
  }
  for (const phase of schedule.phases) {
    const rect = svgElement("rect", {
      x: x(phase.start), y: trackTop,
      width: Math.max(1, x(phase.end) - x(phase.start)), height: trackHeight,
      rx: 2, class: phase.task === "A" ? "schedule-phase-a" : "schedule-phase-b",
    });
    const label = svgElement("text", {
      x: (x(phase.start) + x(phase.end)) / 2,
      y: trackTop + 23,
      "text-anchor": "middle",
      class: "schedule-phase-label",
    });
    label.textContent = phase.phase;
    svg.append(rect, label);
  }
  if (schedule.idleTime > 0) {
    svg.append(svgElement("rect", {
      x: x(schedule.totalWork), y: trackTop,
      width: x(DEADLINE) - x(schedule.totalWork), height: trackHeight,
      class: "schedule-idle",
    }));
  }
  for (const task of ["A", "B"]) {
    for (const time of [schedule.reviewTimes[task], schedule.completionTimes[task]]) {
      svg.append(svgElement("line", {
        x1: x(time), x2: x(time), y1: trackTop - 8, y2: trackTop + trackHeight + 8,
        class: "schedule-event",
      }));
    }
  }
  const axisLabel = svgElement("text", {
    x: width / 2, y: height - 7, "text-anchor": "middle", class: "mw-axis-title",
  });
  axisLabel.textContent = "カレンダー時刻 t";
  svg.append(axisLabel);
  panel.chart.replaceChildren(svg);
}

export function renderScheduleOpportunityCost(initial = {}) {
  const defaults = { ...DEFAULTS, ...initial };
  const state = { ...defaults };
  const instance = createWidgetRoot(
    "順序が生む機会費用",
    "6通りのフェーズ順序を切り替え、レビュー時刻と期待上昇の遅延費用を比較します。",
  );
  const extraStyle = htmlElement("style");
  extraStyle.textContent = EXTRA_STYLES;
  instance.root.prepend(extraStyle);
  const controller = new AbortController();
  const cleanups = [() => controller.abort()];
  let width = 680;
  let render = () => {};

  const orderField = htmlElement("div", "schedule-order");
  const orderLabel = htmlElement("label");
  orderLabel.append(htmlElement("span", undefined, "フェーズ順序 π"));
  const select = htmlElement("select");
  select.setAttribute("aria-label", "フェーズ順序");
  PHASE_ORDERS.forEach((order, index) => {
    const option = htmlElement("option", undefined, order.join(" → "));
    option.value = String(index);
    select.append(option);
  });
  select.value = String(state.orderIndex);
  select.addEventListener("change", () => {
    state.orderIndex = Number(select.value);
    render();
  }, { signal: controller.signal });
  orderLabel.append(select);
  orderField.append(orderLabel);
  instance.root.append(orderField);

  createControls(instance, state, defaults, CONTROLS, () => render(), controller.signal);
  instance.root.querySelector(".mw-reset")?.addEventListener("click", () => {
    select.value = String(defaults.orderIndex);
  }, { signal: controller.signal });

  const { container: metricContainer, metrics } = createMetrics({
    reviewA: "A の中間レビュー τA",
    completionA: "A の完了 cA",
    reviewB: "B の中間レビュー τB",
    completionB: "B の完了 cB",
    delay: "期待上昇による遅延費用",
    totalWork: "総作業量",
  });
  instance.root.append(metricContainer);

  const plots = htmlElement("div", "mw-plots");
  const panel = createPanel("フェーズとレビューイベント", `右端は共通締切 T = ${DEADLINE} です。`);
  plots.append(panel.panel);
  const details = htmlElement("div", "mw-details");
  instance.root.append(plots, details);

  render = () => {
    const order = PHASE_ORDERS[state.orderIndex];
    const durations = canonicalDurations(state);
    const schedule = buildSchedule(order, durations, DEADLINE);
    const coefficients = delayCoefficients(order, {
      A: { beta: state.betaA },
      B: { beta: state.betaB },
    });
    const delay = coefficients.vector.reduce(
      (sum, coefficient, index) => sum + coefficient * durations[index],
      0,
    );
    setOutput(metrics.reviewA.output, formatNumber(schedule.reviewTimes.A));
    setOutput(metrics.completionA.output, formatNumber(schedule.completionTimes.A));
    setOutput(metrics.reviewB.output, formatNumber(schedule.reviewTimes.B));
    setOutput(metrics.completionB.output, formatNumber(schedule.completionTimes.B));
    setOutput(metrics.delay.output, formatNumber(delay));
    setOutput(metrics.totalWork.output, formatNumber(schedule.totalWork));
    instance.status.textContent = schedule.orderLabel;
    instance.status.dataset.state = "resolved";
    details.replaceChildren(
      htmlElement("p", undefined,
        `各フェーズ1単位の限界遅延費用：A₁ = ${formatNumber(coefficients.byPhase.A1)}、A₂ = ${formatNumber(coefficients.byPhase.A2)}、B₁ = ${formatNumber(coefficients.byPhase.B1)}、B₂ = ${formatNumber(coefficients.byPhase.B2)}。`),
      htmlElement("p", undefined,
        "前方のフェーズほど多くの後続レビューイベントへ作用し、同じ作業量でも大きな機会費用を持ちます。"),
    );
    drawTimeline(instance, panel, schedule, width);
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
