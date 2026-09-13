import { DEADLINE } from "../review-model/model.js";

export const TASKS = Object.freeze(["A", "B"]);
export const CANONICAL_PHASES = Object.freeze(["A1", "A2", "B1", "B2"]);

/** Every linear extension of A1 < A2 and B1 < B2. */
export const PHASE_ORDERS = Object.freeze([
  Object.freeze(["A1", "A2", "B1", "B2"]),
  Object.freeze(["A1", "B1", "A2", "B2"]),
  Object.freeze(["A1", "B1", "B2", "A2"]),
  Object.freeze(["B1", "A1", "A2", "B2"]),
  Object.freeze(["B1", "A1", "B2", "A2"]),
  Object.freeze(["B1", "B2", "A1", "A2"]),
]);

function finiteNonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative number.`);
  }
}

export function normalizeOrder(order) {
  if (!Array.isArray(order) || order.length !== CANONICAL_PHASES.length) {
    throw new RangeError("order must contain four phases.");
  }
  const normalized = [...order];
  const sorted = [...normalized].sort().join(",");
  if (sorted !== [...CANONICAL_PHASES].sort().join(",")) {
    throw new RangeError("order must contain A1, A2, B1, and B2 exactly once.");
  }
  if (normalized.indexOf("A1") > normalized.indexOf("A2")
      || normalized.indexOf("B1") > normalized.indexOf("B2")) {
    throw new RangeError("order must respect A1 before A2 and B1 before B2.");
  }
  return normalized;
}

export function normalizeDurations(durations) {
  const normalized = Array.isArray(durations)
    ? durations
    : [durations?.xA, durations?.yA, durations?.xB, durations?.yB];
  if (normalized.length !== CANONICAL_PHASES.length) {
    throw new RangeError("durations must contain xA, yA, xB, and yB.");
  }
  normalized.forEach((value, index) => finiteNonnegative(value, `duration[${index}]`));
  return [...normalized];
}

/** Build a contiguous, left-justified calendar schedule for one phase order. */
export function buildSchedule(order, durations, deadline = DEADLINE) {
  finiteNonnegative(deadline, "deadline");
  const phasesInOrder = normalizeOrder(order);
  const vector = normalizeDurations(durations);
  const durationByPhase = Object.fromEntries(
    CANONICAL_PHASES.map((phase, index) => [phase, vector[index]]),
  );
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
    idleTime: deadline - cursor,
  };
}

/**
 * Coefficient of each canonical phase duration in the expectation-delay term.
 * A phase delays every review/completion event at or after that phase.
 */
export function delayCoefficients(order, managers, taskWeights = { A: 1, B: 1 }) {
  const phases = normalizeOrder(order);
  const coefficients = Object.fromEntries(CANONICAL_PHASES.map(phase => [phase, 0]));
  for (const task of TASKS) {
    const beta = managers?.[task]?.beta;
    const weight = taskWeights?.[task] ?? 1;
    finiteNonnegative(beta, `beta_${task}`);
    finiteNonnegative(weight, `weight_${task}`);
    for (const eventPhase of [`${task}1`, `${task}2`]) {
      const eventIndex = phases.indexOf(eventPhase);
      for (let index = 0; index <= eventIndex; index += 1) {
        coefficients[phases[index]] += weight * beta;
      }
    }
  }
  return {
    byPhase: coefficients,
    vector: CANONICAL_PHASES.map(phase => coefficients[phase]),
  };
}
