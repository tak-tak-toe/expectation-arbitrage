import {
  MINIMUM_QUALITY,
  baselineQuality,
  reviewedQuality,
  managerExpectation,
  reviewEvaluation,
} from "../review-model/model.js";

export const DEADLINE = 25;
export const Q_MINIMUM = MINIMUM_QUALITY;
export const CONSTRAINT_TOLERANCE = 1e-9;

export const DEFAULT_TWO_TASK_PARAMETERS = Object.freeze({
  worker: Object.freeze({ qbar: 80, k: 0.25, h: 4 }),
  managers: Object.freeze({
    A: Object.freeze({ a: 20, b: 5 }),
    B: Object.freeze({ a: 25, b: 2.5 }),
  }),
});

export const PHASE_ORDERS = Object.freeze([
  Object.freeze(["A1", "A2", "B1", "B2"]),
  Object.freeze(["A1", "B1", "A2", "B2"]),
  Object.freeze(["A1", "B1", "B2", "A2"]),
  Object.freeze(["B1", "A1", "A2", "B2"]),
  Object.freeze(["B1", "A1", "B2", "A2"]),
  Object.freeze(["B1", "B2", "A1", "A2"]),
]);

const TASKS = Object.freeze(["A", "B"]);
const EXPECTED_PHASES = Object.freeze(["A1", "A2", "B1", "B2"]);

function finiteNonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative number.`);
  }
}

function finitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite, positive number.`);
  }
}

function normalizeParameters(parameters = DEFAULT_TWO_TASK_PARAMETERS) {
  const worker = parameters.worker ?? DEFAULT_TWO_TASK_PARAMETERS.worker;
  const managers = parameters.managers ?? DEFAULT_TWO_TASK_PARAMETERS.managers;
  const normalized = {
    worker: {
      qbar: worker.qbar,
      k: worker.k,
      h: worker.h,
    },
    managers: {
      A: { ...managers.A },
      B: { ...managers.B },
    },
  };

  finitePositive(normalized.worker.qbar, "qbar");
  finitePositive(normalized.worker.k, "k");
  finitePositive(normalized.worker.h, "h");
  if (normalized.worker.qbar > Q_MINIMUM) {
    throw new RangeError(`qbar must be at most ${Q_MINIMUM}.`);
  }
  for (const task of TASKS) {
    finiteNonnegative(normalized.managers[task].a, `a_${task}`);
    finiteNonnegative(normalized.managers[task].b, `b_${task}`);
  }
  return normalized;
}

function normalizeDurations(durations) {
  const vector = Array.isArray(durations)
    ? durations
    : [durations?.xA, durations?.yA, durations?.xB, durations?.yB];
  if (vector.length !== 4) {
    throw new RangeError("durations must contain xA, yA, xB, and yB.");
  }
  vector.forEach((value, index) => finiteNonnegative(value, `duration[${index}]`));
  return [...vector];
}

function normalizeOrder(order) {
  if (!Array.isArray(order) || order.length !== 4) {
    throw new RangeError("order must contain four phases.");
  }
  const phases = [...order];
  if ([...phases].sort().join(",") !== [...EXPECTED_PHASES].sort().join(",")) {
    throw new RangeError("order must contain A1, A2, B1, and B2 exactly once.");
  }
  if (phases.indexOf("A1") > phases.indexOf("A2")
      || phases.indexOf("B1") > phases.indexOf("B2")) {
    throw new RangeError("order must respect A1 before A2 and B1 before B2.");
  }
  return phases;
}

function taskKey(task) {
  if (!TASKS.includes(task)) {
    throw new RangeError("task must be A or B.");
  }
  return task;
}

/**
 * Build the canonical schedule for an order.
 *
 * The four phases are contiguous and left-justified. With nonnegative manager
 * expectation slopes, moving a review earlier preserves work-based quality and
 * weakly improves its evaluation, so any idle time can be placed after all work.
 */
export function buildSchedule(order, durations) {
  const phasesInOrder = normalizeOrder(order);
  const vector = normalizeDurations(durations);
  const durationByPhase = {
    A1: vector[0],
    A2: vector[1],
    B1: vector[2],
    B2: vector[3],
  };
  const reviewTimes = {};
  const completionTimes = {};
  let cursor = 0;
  const phases = phasesInOrder.map(phase => {
    const start = cursor;
    const duration = durationByPhase[phase];
    cursor += duration;
    const task = phase[0];
    const stage = Number(phase[1]);
    if (stage === 1) reviewTimes[task] = cursor;
    else completionTimes[task] = cursor;
    return { phase, task, stage, duration, start, end: cursor };
  });

  return {
    order: phasesInOrder,
    orderLabel: phasesInOrder.join(" → "),
    phases,
    durations: vector,
    reviewTimes,
    completionTimes,
    totalWork: cursor,
    idleTime: DEADLINE - cursor,
  };
}

function qualityShortfall(value) {
  return Math.max(0, Q_MINIMUM - value);
}

/** Evaluate both task outcomes, the objective, and every model constraint. */
export function evaluateSchedule(
  order,
  durations,
  parameters = DEFAULT_TWO_TASK_PARAMETERS,
  { objective } = {},
) {
  const normalized = normalizeParameters(parameters);
  const schedule = buildSchedule(order, durations);
  const [xA, yA, xB, yB] = schedule.durations;
  const work = { A: { x: xA, y: yA }, B: { x: xB, y: yB } };
  const tasks = {};
  let centeredObjective = 0;
  let totalEvaluation = 0;

  for (const task of TASKS) {
    const { x, y } = work[task];
    const { a, b } = normalized.managers[task];
    const tau = schedule.reviewTimes[task];
    const completionTime = schedule.completionTimes[task];
    const reviewQuality = baselineQuality(x, normalized.worker);
    // reviewedQuality evaluates the shared partial-reset equation from Chapter 1:
    // q0(x) + q0(x + y - f(x)) - q0(x - f(x)).
    // Quality stays continuous at the review; rewinding effective age restores
    // the post-review marginal improvement instead of adding an instant jump.
    const finalQuality = reviewedQuality(x, y, normalized.worker);
    const evaluation = reviewEvaluation({
      reviewQuality,
      finalQuality,
      reviewTime: tau,
      completionTime,
      a,
      b,
    });
    // Removing the intercept a gives an exactly equivalent ranking objective.
    // This makes the schedule's invariance to a explicit and numerically stable.
    const centeredEvaluation = 0.5
      * (reviewQuality + finalQuality - b * (tau + completionTime));
    centeredObjective += centeredEvaluation;
    totalEvaluation += evaluation;
    tasks[task] = {
      x,
      y,
      tau,
      completionTime,
      reviewQuality,
      finalQuality,
      evaluation,
      centeredEvaluation,
    };
  }

  const qualityA = qualityShortfall(tasks.A.finalQuality);
  const qualityB = qualityShortfall(tasks.B.finalQuality);
  const time = Math.max(0, schedule.totalWork - DEADLINE);
  const positivity = schedule.durations.reduce(
    (sum, duration) => sum + (duration > 0 ? 0 : 1),
    0,
  );
  const normalizedTotal = (qualityA / Q_MINIMUM) ** 2
    + (qualityB / Q_MINIMUM) ** 2
    + (time / DEADLINE) ** 2
    + positivity;
  const feasible = qualityA <= CONSTRAINT_TOLERANCE
    && qualityB <= CONSTRAINT_TOLERANCE
    && time <= CONSTRAINT_TOLERANCE
    && positivity === 0;

  const baseResult = {
    feasible,
    order: schedule.order,
    orderLabel: schedule.orderLabel,
    phases: schedule.phases,
    durations: schedule.durations,
    tasks,
    totalEvaluation,
    meanEvaluation: totalEvaluation / 2,
    totalWork: schedule.totalWork,
    idleTime: schedule.idleTime,
    centeredObjective,
    violation: {
      qualityA,
      qualityB,
      time,
      positivity,
      normalizedTotal,
    },
  };
  const objectiveValue = objective
    ? objective(baseResult, normalized)
    : centeredObjective;
  if (!Number.isFinite(objectiveValue)) {
    throw new RangeError("objective must return a finite number.");
  }
  return { ...baseResult, objectiveValue };
}

/** Quality accumulated by one task at a calendar time in a built schedule. */
export function qualityAtCalendarTime(
  scheduleOrOrder,
  task,
  time,
  parameters = DEFAULT_TWO_TASK_PARAMETERS,
  durations,
) {
  finiteNonnegative(time, "time");
  const selectedTask = taskKey(task);
  const normalized = normalizeParameters(parameters);
  const schedule = Array.isArray(scheduleOrOrder)
    ? buildSchedule(scheduleOrOrder, durations)
    : scheduleOrOrder;
  if (!schedule || !Array.isArray(schedule.phases)) {
    throw new TypeError("schedule must be returned by buildSchedule.");
  }

  let before = 0;
  let after = 0;
  for (const phase of schedule.phases) {
    if (phase.task !== selectedTask || time <= phase.start) continue;
    const elapsed = Math.min(phase.duration, time - phase.start);
    if (phase.stage === 1) before += Math.max(0, elapsed);
    else after += Math.max(0, elapsed);
  }
  return after > 0
    ? reviewedQuality(before, after, normalized.worker)
    : baselineQuality(before, normalized.worker);
}

/** Manager expectation follows calendar time, independently of work activity. */
export function expectationAtCalendarTime(
  task,
  time,
  parameters = DEFAULT_TWO_TASK_PARAMETERS,
) {
  const selectedTask = taskKey(task);
  const normalized = normalizeParameters(parameters);
  return managerExpectation(time, normalized.managers[selectedTask]);
}
