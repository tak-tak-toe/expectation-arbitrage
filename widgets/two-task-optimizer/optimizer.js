import { oneReviewOutcome } from "../review-model/model.js";
import {
  DEADLINE,
  Q_MINIMUM,
  MIN_PHASE,
  DEFAULT_TWO_TASK_PARAMETERS,
  PHASE_ORDERS,
  evaluateSchedule,
  evaluateFixedOrderNlp,
  normalizeParameters,
} from "./model.js";
import {
  normalizeNlpOptions,
  projectDurations,
  solveLocalNlp,
} from "./nlp.js";

export { MIN_PHASE } from "./model.js";

export const DEFAULT_OPTIMIZER_OPTIONS = Object.freeze({
  latticeResolution: 5,
  startsPerOrder: 8,
  pairGridPoints: 321,
});

export const SOLVER_STATUS_LABELS = Object.freeze({
  converged_kkt: "best deterministic KKT candidate found",
  feasible_iteration_limit: "best feasible deterministic local-solver result",
  no_feasible_candidate_found: "no feasible candidate found by the deterministic search",
});

function objectiveForComparison(candidate) {
  return candidate.overallCenteredJ ?? candidate.overallJ ?? candidate.objectiveValue;
}

function violationForComparison(candidate) {
  return candidate.violation.normalizedMaximum ?? candidate.violation.normalizedTotal;
}

function lexicographicDurations(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function candidateClass(candidate) {
  if (candidate.feasible && candidate.solverStatus === "converged_kkt") return 0;
  if (candidate.feasible) return 1;
  return 2;
}

/** Sort comparator: a negative result means left is the preferred candidate. */
export function compareCandidates(left, right) {
  const classDifference = candidateClass(left) - candidateClass(right);
  if (classDifference !== 0) return classDifference;
  if (!left.feasible) {
    const violationDifference = violationForComparison(left) - violationForComparison(right);
    if (Math.abs(violationDifference) > 1e-14) return violationDifference;
  }
  const objectiveDifference = objectiveForComparison(right) - objectiveForComparison(left);
  if (Math.abs(objectiveDifference) > 1e-10) return objectiveDifference;
  const leftKkt = left.solverDiagnostics?.kktResidual ?? Number.POSITIVE_INFINITY;
  const rightKkt = right.solverDiagnostics?.kktResidual ?? Number.POSITIVE_INFINITY;
  if (Math.abs(leftKkt - rightKkt) > 1e-14) return leftKkt - rightKkt;
  if (left.totalWork !== right.totalWork) return left.totalWork - right.totalWork;
  if ((left.orderIndex ?? 0) !== (right.orderIndex ?? 0)) {
    return (left.orderIndex ?? 0) - (right.orderIndex ?? 0);
  }
  return lexicographicDurations(left.durations, right.durations);
}

function requiredAfterWork(before, worker, minimumPhase) {
  const maximumAfter = DEADLINE - before;
  if (maximumAfter < minimumPhase) return Number.POSITIVE_INFINITY;
  if (oneReviewOutcome(before, minimumPhase, worker).finalQuality >= Q_MINIMUM) {
    return minimumPhase;
  }
  if (oneReviewOutcome(before, maximumAfter, worker).finalQuality < Q_MINIMUM) {
    return Number.POSITIVE_INFINITY;
  }
  let lower = minimumPhase;
  let upper = maximumAfter;
  for (let iteration = 0; iteration < 56; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (oneReviewOutcome(before, middle, worker).finalQuality >= Q_MINIMUM) upper = middle;
    else lower = middle;
  }
  return upper;
}

/** Deterministic one-dimensional construction of a quality-feasible work pair. */
export function minimumQualityWorkPair(
  worker,
  { minimumPhase = MIN_PHASE, gridPoints = 321 } = {},
) {
  if (!Number.isFinite(minimumPhase) || minimumPhase <= 0
      || 2 * minimumPhase >= DEADLINE) {
    throw new RangeError("minimumPhase must be positive and leave two phases before the deadline.");
  }
  if (!Number.isInteger(gridPoints) || gridPoints < 33) {
    throw new RangeError("gridPoints must be an integer of at least 33.");
  }
  const upperBefore = DEADLINE - minimumPhase;
  const spacing = (upperBefore - minimumPhase) / (gridPoints - 1);
  const pairAt = before => {
    if (before < minimumPhase || before > upperBefore) return null;
    const after = requiredAfterWork(before, worker, minimumPhase);
    if (!Number.isFinite(after)) return null;
    return { before, after, total: before + after };
  };
  let best = null;
  for (let index = 0; index < gridPoints; index += 1) {
    const candidate = pairAt(minimumPhase + spacing * index);
    if (candidate && (!best || candidate.total < best.total)) best = candidate;
  }
  if (!best) return null;

  let left = Math.max(minimumPhase, best.before - spacing);
  let right = Math.min(upperBefore, best.before + spacing);
  const ratio = (Math.sqrt(5) - 1) / 2;
  let innerLeft = right - ratio * (right - left);
  let innerRight = left + ratio * (right - left);
  let leftPair = pairAt(innerLeft);
  let rightPair = pairAt(innerRight);
  for (let iteration = 0; iteration < 72; iteration += 1) {
    const leftValue = leftPair?.total ?? Number.POSITIVE_INFINITY;
    const rightValue = rightPair?.total ?? Number.POSITIVE_INFINITY;
    if (leftValue <= rightValue) {
      right = innerRight;
      innerRight = innerLeft;
      rightPair = leftPair;
      innerLeft = right - ratio * (right - left);
      leftPair = pairAt(innerLeft);
    } else {
      left = innerLeft;
      innerLeft = innerRight;
      leftPair = rightPair;
      innerRight = left + ratio * (right - left);
      rightPair = pairAt(innerRight);
    }
  }
  for (const candidate of [leftPair, rightPair, pairAt(left), pairAt(right)]) {
    if (candidate && candidate.total < best.total) best = candidate;
  }
  return best;
}

function compositions(total, parts, prefix = [], result = []) {
  if (parts === 1) {
    result.push([...prefix, total]);
    return result;
  }
  for (let value = 0; value <= total; value += 1) {
    compositions(total - value, parts - 1, [...prefix, value], result);
  }
  return result;
}

function structuredStartPool(worker, options, feasiblePair) {
  const minimumPhase = options.minimumPhase;
  const capacity = DEADLINE - 4 * minimumPhase;
  const starts = [
    Array(4).fill(DEADLINE / 4),
    Array(4).fill(DEADLINE / 5),
    [6, 4, 6, 4],
    [4, 6, 4, 6],
  ];
  if (feasiblePair && 2 * feasiblePair.total <= DEADLINE + 1e-9) {
    const base = [
      feasiblePair.before,
      feasiblePair.after,
      feasiblePair.before,
      feasiblePair.after,
    ];
    starts.push(base);
    const slack = Math.max(0, DEADLINE - base.reduce((sum, value) => sum + value, 0));
    starts.push(base.map(value => value + slack / 4));
    for (let dimension = 0; dimension < 4; dimension += 1) {
      const boundary = [...base];
      boundary[dimension] += slack;
      starts.push(boundary);
    }
  }
  for (const allocation of compositions(options.latticeResolution, 5)) {
    starts.push(allocation.slice(0, 4).map(value => (
      minimumPhase + capacity * value / options.latticeResolution
    )));
  }
  const unique = new Map();
  for (const start of starts) {
    const projected = projectDurations(start, minimumPhase, DEADLINE);
    const key = projected.map(value => value.toFixed(12)).join(",");
    if (!unique.has(key)) unique.set(key, projected);
  }
  return [...unique.values()];
}

function startComparator(left, right) {
  if (left.evaluation.feasible !== right.evaluation.feasible) {
    return left.evaluation.feasible ? -1 : 1;
  }
  const violation = left.evaluation.violation.normalizedMaximum
    - right.evaluation.violation.normalizedMaximum;
  if (Math.abs(violation) > 1e-14) return violation;
  const objective = right.evaluation.overallJ - left.evaluation.overallJ;
  if (Math.abs(objective) > 1e-10) return objective;
  return lexicographicDurations(left.durations, right.durations);
}

function squaredDistance(left, right) {
  return left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0);
}

function selectStarts(order, parameters, pool, count, minimumPhase) {
  const ranked = pool.map(durations => ({
    durations,
    evaluation: evaluateSchedule(order, durations, parameters, { minimumPhase }),
  })).sort(startComparator);
  const selected = ranked.slice(0, Math.min(3, count));
  const candidates = ranked.slice(0, Math.max(count * 8, 48));
  while (selected.length < count && selected.length < candidates.length) {
    let choice = null;
    let choiceDistance = -1;
    for (const candidate of candidates) {
      if (selected.includes(candidate)) continue;
      const distance = Math.min(...selected.map(item => (
        squaredDistance(candidate.durations, item.durations)
      )));
      if (distance > choiceDistance + 1e-12) {
        choice = candidate;
        choiceDistance = distance;
      }
    }
    if (!choice) break;
    selected.push(choice);
  }
  return selected.map(item => item.durations);
}

function solveOrder(order, orderIndex, parameters, pool, options) {
  const starts = selectStarts(
    order,
    parameters,
    pool,
    options.startsPerOrder,
    options.minimumPhase,
  );
  const evaluate = durations => evaluateFixedOrderNlp(
    order,
    durations,
    parameters,
    { minimumPhase: options.minimumPhase },
  );
  const localResults = starts.map(start => solveLocalNlp(evaluate, start, options));
  const candidates = localResults.map(local => ({
    ...local.point.evaluation,
    feasible: local.feasible && local.point.evaluation.feasible,
    orderIndex,
    solverStatus: local.solverStatus,
    statusLabel: SOLVER_STATUS_LABELS[local.solverStatus],
    approximate: true,
    globalCertificate: false,
    solverDiagnostics: local.diagnostics,
  }));
  candidates.sort(compareCandidates);
  const best = candidates[0];
  return {
    ...best,
    searchDiagnostics: {
      startsTried: starts.length,
      convergedStarts: candidates.filter(candidate => (
        candidate.solverStatus === "converged_kkt"
      )).length,
      feasibleStarts: candidates.filter(candidate => candidate.feasible).length,
      evaluations: localResults.reduce((sum, result) => (
        sum + result.diagnostics.evaluations
      ), 0),
    },
  };
}

/** Validate and fill both multistart and continuous-solver options. */
export function normalizeOptimizerOptions(overrides = {}) {
  if (!overrides || typeof overrides !== "object") {
    throw new TypeError("optimizer options must be an object.");
  }
  const options = {
    ...DEFAULT_OPTIMIZER_OPTIONS,
    ...normalizeNlpOptions({
      ...overrides,
      minimumPhase: overrides.minimumPhase ?? MIN_PHASE,
    }),
  };
  if (!Number.isInteger(options.latticeResolution) || options.latticeResolution < 2) {
    throw new RangeError("latticeResolution must be an integer of at least two.");
  }
  if (!Number.isInteger(options.startsPerOrder) || options.startsPerOrder < 1) {
    throw new RangeError("startsPerOrder must be a positive integer.");
  }
  if (!Number.isInteger(options.pairGridPoints) || options.pairGridPoints < 33) {
    throw new RangeError("pairGridPoints must be an integer of at least 33.");
  }
  return options;
}

/**
 * Enumerate the six orders exactly and solve every continuous problem locally
 * from a fixed, structured set of starts.
 */
export function optimizeTwoTasks(parameters = DEFAULT_TWO_TASK_PARAMETERS, overrides = {}) {
  const normalized = normalizeParameters(parameters);
  const options = normalizeOptimizerOptions(overrides);
  const minimumPhase = options.minimumPhase;
  const feasiblePair = minimumQualityWorkPair(normalized.worker, {
    minimumPhase,
    gridPoints: options.pairGridPoints,
  });
  const fullOptions = { ...options, minimumPhase };
  const pool = structuredStartPool(normalized.worker, fullOptions, feasiblePair);
  const orderResults = PHASE_ORDERS.map((order, orderIndex) => solveOrder(
    order,
    orderIndex,
    normalized,
    pool,
    fullOptions,
  ));
  const best = [...orderResults].sort(compareCandidates)[0];
  const totalEvaluations = orderResults.reduce((sum, result) => (
    sum + result.searchDiagnostics.evaluations
  ), 0);
  return {
    feasible: best.feasible,
    solverStatus: best.solverStatus,
    statusLabel: best.statusLabel,
    approximate: true,
    globalCertificate: false,
    best,
    orderResults,
    diagnostics: {
      algorithm: "deterministic structured-multistart projected augmented-Lagrangian with BFGS",
      phaseOrderEnumeration: "exact",
      phaseOrdersEvaluated: orderResults.length,
      continuousSolver: "local",
      approximate: true,
      globalCertificate: false,
      minimumPhase,
      structuredStarts: pool.length,
      startsPerOrder: options.startsPerOrder,
      totalEvaluations,
      feasibleOrders: orderResults.filter(result => result.feasible).length,
      convergedOrders: orderResults.filter(result => (
        result.solverStatus === "converged_kkt"
      )).length,
      feasibilityStart: feasiblePair,
      status: best.solverStatus,
      statusLabel: best.statusLabel,
    },
  };
}
