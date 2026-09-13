import {
  DEADLINE as CORE_DEADLINE,
  QUALITY_MINIMUM,
  DEFAULT_WORKER,
  DEFAULT_MANAGER,
  normalizeWorkerParameters,
  normalizeManagerParameters,
  phi,
  phiPrime,
  oneReviewOutcome,
  oneReviewDerivatives,
  expectation,
  reviewScore,
  sumReviewScores,
} from "../review-model/model.js";
import {
  TASKS,
  PHASE_ORDERS,
  buildSchedule,
  delayCoefficients,
  normalizeDurations,
} from "./schedule.js";

export const DEADLINE = CORE_DEADLINE;
export const Q_MINIMUM = QUALITY_MINIMUM;
export const MIN_PHASE = 1e-4;
export const CONSTRAINT_TOLERANCE = 1e-7;
export { PHASE_ORDERS, buildSchedule, delayCoefficients };

export const DEFAULT_TWO_TASK_PARAMETERS = Object.freeze({
  worker: Object.freeze({ ...DEFAULT_WORKER }),
  managers: Object.freeze({
    A: Object.freeze({ ...DEFAULT_MANAGER, e0: 20, beta: 5 }),
    B: Object.freeze({ ...DEFAULT_MANAGER, e0: 25, beta: 2.5 }),
  }),
  taskWeights: Object.freeze({ A: 1, B: 1 }),
});

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

export function normalizeParameters(parameters = DEFAULT_TWO_TASK_PARAMETERS) {
  if (!parameters || typeof parameters !== "object") {
    throw new TypeError("parameters must be an object.");
  }
  const worker = normalizeWorkerParameters(
    parameters.worker ?? DEFAULT_TWO_TASK_PARAMETERS.worker,
  );
  const managers = parameters.managers ?? DEFAULT_TWO_TASK_PARAMETERS.managers;
  const taskWeights = parameters.taskWeights ?? DEFAULT_TWO_TASK_PARAMETERS.taskWeights;
  const normalized = {
    worker,
    managers: {
      A: normalizeManagerParameters({
        ...DEFAULT_TWO_TASK_PARAMETERS.managers.A,
        ...managers.A,
      }),
      B: normalizeManagerParameters({
        ...DEFAULT_TWO_TASK_PARAMETERS.managers.B,
        ...managers.B,
      }),
    },
    taskWeights: {
      A: taskWeights.A ?? 1,
      B: taskWeights.B ?? 1,
    },
  };

  if (normalized.worker.qInfinity > Q_MINIMUM) {
    throw new RangeError(`qInfinity must be at most ${Q_MINIMUM}.`);
  }
  if (normalized.worker.rhoBar > 1) {
    throw new RangeError("rhoBar must be at most one.");
  }
  for (const task of TASKS) {
    finitePositive(normalized.taskWeights[task], `taskWeight_${task}`);
  }
  return normalized;
}

function taskWork(vector) {
  return {
    A: { x: vector[0], y: vector[1] },
    B: { x: vector[2], y: vector[3] },
  };
}

function constraintSummary(schedule, tasks, minimumPhase) {
  const raw = {
    qualityA: Math.max(0, Q_MINIMUM - tasks.A.finalQuality),
    qualityB: Math.max(0, Q_MINIMUM - tasks.B.finalQuality),
    time: Math.max(0, schedule.totalWork - DEADLINE),
    lowerBounds: schedule.durations.map(duration => Math.max(0, minimumPhase - duration)),
  };
  raw.lowerBound = Math.max(0, ...raw.lowerBounds);
  raw.normalizedMaximum = Math.max(
    raw.qualityA / Q_MINIMUM,
    raw.qualityB / Q_MINIMUM,
    raw.time / DEADLINE,
    raw.lowerBound / DEADLINE,
  );
  raw.normalizedTotal = (raw.qualityA / Q_MINIMUM) ** 2
    + (raw.qualityB / Q_MINIMUM) ** 2
    + (raw.time / DEADLINE) ** 2
    + raw.lowerBounds.reduce((sum, value) => sum + (value / DEADLINE) ** 2, 0);
  return raw;
}

/** Evaluate qualities, event scores, task totals, and constraints for one order. */
export function evaluateSchedule(
  order,
  durations,
  parameters = DEFAULT_TWO_TASK_PARAMETERS,
  { minimumPhase = MIN_PHASE } = {},
) {
  finiteNonnegative(minimumPhase, "minimumPhase");
  const normalized = normalizeParameters(parameters);
  const vector = normalizeDurations(durations);
  const schedule = buildSchedule(order, vector, DEADLINE);
  const work = taskWork(vector);
  const tasks = {};
  const weightedTaskValues = [];
  const centeredWeightedTaskValues = [];

  for (const task of TASKS) {
    const { x, y } = work[task];
    const manager = normalized.managers[task];
    const outcome = oneReviewOutcome(x, y, normalized.worker);
    const review = reviewScore(outcome.reviewQuality, schedule.reviewTimes[task], manager);
    const final = reviewScore(outcome.finalQuality, schedule.completionTimes[task], manager);
    const J = sumReviewScores([review, final]);
    const centeredJ = J + 2 * manager.e0;
    weightedTaskValues.push(normalized.taskWeights[task] * J);
    centeredWeightedTaskValues.push(normalized.taskWeights[task] * centeredJ);
    tasks[task] = {
      x,
      y,
      tau: schedule.reviewTimes[task],
      completionTime: schedule.completionTimes[task],
      reviewQuality: outcome.reviewQuality,
      finalQuality: outcome.finalQuality,
      scores: { review, final },
      J,
      centeredJ,
      weightedJ: normalized.taskWeights[task] * J,
      weightedCenteredJ: normalized.taskWeights[task] * centeredJ,
      outcome,
    };
  }

  const overallJ = sumReviewScores(weightedTaskValues);
  const overallCenteredJ = sumReviewScores(centeredWeightedTaskValues);
  const violation = constraintSummary(schedule, tasks, minimumPhase);
  const feasible = violation.normalizedMaximum <= CONSTRAINT_TOLERANCE;
  return {
    feasible,
    order: schedule.order,
    orderLabel: schedule.orderLabel,
    phases: schedule.phases,
    durations: schedule.durations,
    tasks,
    overallJ,
    overallCenteredJ,
    objectiveValue: overallJ,
    totalWork: schedule.totalWork,
    idleTime: schedule.idleTime,
    violation,
  };
}

function objectiveScale(parameters) {
  const qualityScale = 3 * parameters.worker.qInfinity;
  return Math.max(1, TASKS.reduce((sum, task) => {
    const manager = parameters.managers[task];
    return sum + parameters.taskWeights[task]
      * (qualityScale + 2 * manager.beta * DEADLINE);
  }, 0));
}

/**
 * Smooth fixed-order NLP in the convention min f(z), g(z) <= 0.
 * Gradients are analytic and follow canonical order [xA, yA, xB, yB].
 */
export function evaluateFixedOrderNlp(
  order,
  durations,
  parameters = DEFAULT_TWO_TASK_PARAMETERS,
  { minimumPhase = MIN_PHASE } = {},
) {
  const normalized = normalizeParameters(parameters);
  const evaluation = evaluateSchedule(order, durations, normalized, { minimumPhase });
  const vector = evaluation.durations;
  const work = taskWork(vector);
  const delay = delayCoefficients(order, normalized.managers, normalized.taskWeights);
  const objectiveGradientForMaximum = delay.vector.map(value => -value);
  const qualityGradients = {};

  for (const [task, offset] of [["A", 0], ["B", 2]]) {
    const { x, y } = work[task];
    const derivatives = oneReviewDerivatives(x, y, normalized.worker);
    const weight = normalized.taskWeights[task];
    objectiveGradientForMaximum[offset] += weight
      * (phiPrime(x, normalized.worker) + derivatives.finalQualityDx);
    objectiveGradientForMaximum[offset + 1] += weight * derivatives.finalQualityDy;
    qualityGradients[task] = [derivatives.finalQualityDx, derivatives.finalQualityDy];
  }

  const constraintNames = [
    "qualityA", "qualityB", "deadline",
    "lowerXA", "lowerYA", "lowerXB", "lowerYB",
  ];
  const constraintValues = [
    Q_MINIMUM - evaluation.tasks.A.finalQuality,
    Q_MINIMUM - evaluation.tasks.B.finalQuality,
    evaluation.totalWork - DEADLINE,
    ...vector.map(value => minimumPhase - value),
  ];
  const constraintJacobian = [
    [-qualityGradients.A[0], -qualityGradients.A[1], 0, 0],
    [0, 0, -qualityGradients.B[0], -qualityGradients.B[1]],
    [1, 1, 1, 1],
    [-1, 0, 0, 0],
    [0, -1, 0, 0],
    [0, 0, -1, 0],
    [0, 0, 0, -1],
  ];

  return {
    evaluation,
    parameters: normalized,
    delayCoefficients: delay,
    // Every schedule contains exactly two scored events per task, so removing
    // the constant manager intercepts is ranking-equivalent to minimizing -J.
    minimizationObjective: -evaluation.overallCenteredJ,
    objectiveGradient: objectiveGradientForMaximum.map(value => -value),
    maximizationGradient: objectiveGradientForMaximum,
    constraintNames,
    constraintValues,
    constraintJacobian,
    constraintScales: [Q_MINIMUM, Q_MINIMUM, DEADLINE, DEADLINE, DEADLINE, DEADLINE, DEADLINE],
    objectiveScale: objectiveScale(normalized),
  };
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
  if (!TASKS.includes(task)) throw new RangeError("task must be A or B.");
  const normalized = normalizeParameters(parameters);
  const schedule = Array.isArray(scheduleOrOrder)
    ? buildSchedule(scheduleOrOrder, durations, DEADLINE)
    : scheduleOrOrder;
  if (!schedule || !Array.isArray(schedule.phases)) {
    throw new TypeError("schedule must be returned by buildSchedule.");
  }

  let before = 0;
  let after = 0;
  for (const phase of schedule.phases) {
    if (phase.task !== task || time <= phase.start) continue;
    const elapsed = Math.min(phase.duration, time - phase.start);
    if (phase.stage === 1) before += Math.max(0, elapsed);
    else after += Math.max(0, elapsed);
  }
  return after > 0
    ? oneReviewOutcome(before, after, normalized.worker).finalQuality
    : phi(before, normalized.worker);
}

/** Manager expectation follows calendar time, independently of work activity. */
export function expectationAtCalendarTime(
  task,
  time,
  parameters = DEFAULT_TWO_TASK_PARAMETERS,
) {
  if (!TASKS.includes(task)) throw new RangeError("task must be A or B.");
  const normalized = normalizeParameters(parameters);
  return expectation(time, normalized.managers[task]);
}
