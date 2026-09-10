/** Pure functions shared by the interactive figures and their tests. */
export const MINIMUM_QUALITY = 100;
export const DEADLINE = 25;
export const DEFAULT_WORKER = Object.freeze({ qbar: 80, k: 0.25, h: 4 });
export const DEFAULT_MANAGER = Object.freeze({ a: 20, b: 3 });
export const DEFAULT_FIXED_WORK = Object.freeze({
  ...DEFAULT_WORKER,
  ...DEFAULT_MANAGER,
  totalWork: DEADLINE,
});

function nonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative number.`);
  }
}

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite, positive number.`);
  }
}

export function baselineQuality(work, { qbar, k } = DEFAULT_WORKER) {
  nonnegative(work, "work");
  positive(qbar, "qbar");
  positive(k, "k");
  return qbar * -Math.expm1(-k * work);
}

export function resetAmount(work, { h } = DEFAULT_WORKER) {
  nonnegative(work, "work");
  positive(h, "h");
  return work * -Math.expm1(-work / h);
}

export function effectiveAge(work, { h } = DEFAULT_WORKER) {
  nonnegative(work, "work");
  positive(h, "h");
  return work * Math.exp(-work / h);
}

export function reviewedQuality(before, after, parameters = DEFAULT_WORKER) {
  nonnegative(after, "after");
  const initial = baselineQuality(before, parameters);
  const age = effectiveAge(before, parameters);
  // Equivalent to q0(before) + q0(age + after) - q0(age),
  // without cancellation for very small increments. Quality is not capped at 100.
  return initial + parameters.qbar * Math.exp(-parameters.k * age)
    * -Math.expm1(-parameters.k * after);
}

export function qualityAtWork(work, reviewWork, parameters = DEFAULT_WORKER) {
  nonnegative(work, "work");
  nonnegative(reviewWork, "reviewWork");
  return work <= reviewWork
    ? baselineQuality(work, parameters)
    : reviewedQuality(reviewWork, work - reviewWork, parameters);
}

export function baselineMarginalQuality(work, parameters = DEFAULT_WORKER) {
  baselineQuality(work, parameters);
  return parameters.qbar * parameters.k * Math.exp(-parameters.k * work);
}

export function reviewedMarginalQuality(before, after, parameters = DEFAULT_WORKER) {
  reviewedQuality(before, after, parameters);
  return parameters.qbar * parameters.k
    * Math.exp(-parameters.k * (effectiveAge(before, parameters) + after));
}

export function managerExpectation(time, { a, b }) {
  nonnegative(time, "time");
  nonnegative(a, "a");
  nonnegative(b, "b");
  return a + b * time;
}

export function reviewEvaluation({ reviewQuality, finalQuality, reviewTime, completionTime, a, b }) {
  nonnegative(reviewQuality, "reviewQuality");
  nonnegative(finalQuality, "finalQuality");
  return (reviewQuality - managerExpectation(reviewTime, { a, b })
    + finalQuality - managerExpectation(completionTime, { a, b })) / 2;
}

function benchmarkParameters(parameters = {}) {
  const normalized = {
    qbar: parameters.qbar ?? DEFAULT_WORKER.qbar,
    k: parameters.k ?? DEFAULT_WORKER.k,
    h: parameters.h ?? DEFAULT_WORKER.h,
    a: parameters.a ?? DEFAULT_MANAGER.a,
    b: parameters.b ?? DEFAULT_MANAGER.b,
  };
  positive(normalized.qbar, "qbar");
  positive(normalized.k, "k");
  positive(normalized.h, "h");
  nonnegative(normalized.a, "a");
  nonnegative(normalized.b, "b");
  if (normalized.qbar > MINIMUM_QUALITY) {
    throw new RangeError(`qbar must be at most ${MINIMUM_QUALITY}.`);
  }
  return normalized;
}

/** Intermediate-review evaluation in the uninterrupted-work benchmark. */
export function localReviewEvaluation(time, parameters = {}) {
  nonnegative(time, "time");
  if (time > DEADLINE) {
    throw new RangeError(`time must be at most ${DEADLINE}.`);
  }
  const normalized = benchmarkParameters(parameters);
  return baselineQuality(time, normalized)
    - managerExpectation(time, normalized);
}

function localReviewHorizon(parameters) {
  const horizon = parameters.deadline ?? parameters.horizon ?? DEADLINE;
  positive(horizon, "horizon");
  if (horizon > DEADLINE) {
    throw new RangeError(`horizon must be at most ${DEADLINE}.`);
  }
  return horizon;
}

/**
 * Analytic maximizer of q0(t) - e(t) on [0, horizon]. The default horizon is
 * 25; a shorter deadline/horizon supports comparisons within a fixed W.
 */
export function localOptimalReviewTime(parameters = {}) {
  const normalized = benchmarkParameters(parameters);
  const horizon = localReviewHorizon(parameters);
  const initialMarginalQuality = baselineMarginalQuality(0, normalized);
  const deadlineMarginalQuality = baselineMarginalQuality(horizon, normalized);
  const tolerance = 32 * Number.EPSILON
    * Math.max(1, initialMarginalQuality, normalized.b);

  if (normalized.b >= initialMarginalQuality - tolerance) return 0;
  if (normalized.b <= deadlineMarginalQuality + tolerance) return horizon;
  return Math.min(
    horizon,
    Math.max(0, Math.log(initialMarginalQuality / normalized.b) / normalized.k),
  );
}

function totalWorkFrom(parameters) {
  const totalWork = parameters.totalWork ?? parameters.W ?? DEFAULT_FIXED_WORK.totalWork;
  positive(totalWork, "totalWork");
  if (totalWork > DEADLINE) {
    throw new RangeError(`totalWork must be at most ${DEADLINE}.`);
  }
  return totalWork;
}

/**
 * Full two-review evaluation at x when total work W is held fixed.
 * Endpoint values are supported for plotting; the optimizer uses 0 < x < W.
 */
export function fullEvaluationAtReviewTime(reviewWork, parameters = {}) {
  nonnegative(reviewWork, "reviewWork");
  const normalized = benchmarkParameters(parameters);
  const totalWork = totalWorkFrom(parameters);
  if (reviewWork > totalWork) {
    throw new RangeError("reviewWork must be at most totalWork.");
  }
  const postReviewWork = totalWork - reviewWork;
  return reviewEvaluation({
    reviewQuality: baselineQuality(reviewWork, normalized),
    finalQuality: reviewedQuality(reviewWork, postReviewWork, normalized),
    reviewTime: reviewWork,
    completionTime: totalWork,
    a: normalized.a,
    b: normalized.b,
  });
}

function fixedWorkPoint(reviewWork, normalized, totalWork) {
  const postReviewWork = totalWork - reviewWork;
  const reviewQuality = baselineQuality(reviewWork, normalized);
  const finalQuality = reviewedQuality(reviewWork, postReviewWork, normalized);
  // The intercept shifts every candidate by the same amount. Ranking this
  // centered expression therefore gives the same optimum with exact a-invariance.
  const centeredEvaluation = 0.5 * (
    reviewQuality - normalized.b * reviewWork
    + finalQuality - normalized.b * totalWork
  );
  return {
    reviewTime: reviewWork,
    postReviewWork,
    reviewQuality,
    finalQuality,
    qualityMargin: finalQuality - MINIMUM_QUALITY,
    evaluation: centeredEvaluation - normalized.a,
    centeredEvaluation,
    feasible: finalQuality >= MINIMUM_QUALITY,
  };
}

function compareFixedWorkPoints(left, right) {
  if (left.feasible !== right.feasible) return left.feasible ? -1 : 1;
  if (left.feasible) {
    if (left.centeredEvaluation !== right.centeredEvaluation) {
      return right.centeredEvaluation - left.centeredEvaluation;
    }
  } else if (left.finalQuality !== right.finalQuality) {
    return right.finalQuality - left.finalQuality;
  }
  return left.reviewTime - right.reviewTime;
}

function refineFixedWorkPoint(start, spacing, lower, upper, evaluate, compare, tolerance) {
  let current = start;
  let step = spacing;
  while (step > tolerance) {
    let moves = 0;
    let improved = true;
    while (improved && moves < 64) {
      improved = false;
      let best = current;
      for (const reviewTime of [current.reviewTime - step, current.reviewTime + step]) {
        if (reviewTime < lower || reviewTime > upper) continue;
        const candidate = evaluate(reviewTime);
        if (compare(candidate, best) < 0) best = candidate;
      }
      if (compare(best, current) < 0) {
        current = best;
        improved = true;
      }
      moves += 1;
    }
    step /= 2;
  }
  return current;
}

/**
 * Deterministic feasible maximization of V(x) for a fixed W.
 * A dense global grid is followed by local pattern refinement of leading points.
 */
export function optimalReviewTimeForFixedWork(parameters = {}, options = {}) {
  const normalized = benchmarkParameters(parameters);
  const totalWork = totalWorkFrom(parameters);
  const gridPoints = options.gridPoints ?? 2001;
  if (!Number.isInteger(gridPoints) || gridPoints < 33) {
    throw new RangeError("gridPoints must be an integer of at least 33.");
  }
  const endpointInset = Math.min(
    totalWork / 4,
    Math.max(Number.EPSILON, totalWork * 1e-8),
  );
  const lower = endpointInset;
  const upper = totalWork - endpointInset;
  const refinementTolerance = options.refinementTolerance
    ?? Math.max(1e-9, totalWork * 1e-9);
  positive(refinementTolerance, "refinementTolerance");
  const evaluate = reviewWork => fixedWorkPoint(reviewWork, normalized, totalWork);
  const spacing = (upper - lower) / (gridPoints - 1);
  const grid = [];
  for (let index = 0; index < gridPoints; index += 1) {
    grid.push(evaluate(lower + spacing * index));
  }

  const candidates = [...grid].sort(compareFixedWorkPoints).slice(0, 12);
  const qualitySeeds = [...grid]
    .sort((left, right) => right.finalQuality - left.finalQuality
      || left.reviewTime - right.reviewTime)
    .slice(0, 4);
  for (const seed of qualitySeeds) {
    const refinedQuality = refineFixedWorkPoint(
      seed,
      spacing,
      lower,
      upper,
      evaluate,
      (left, right) => right.finalQuality - left.finalQuality
        || left.reviewTime - right.reviewTime,
      refinementTolerance,
    );
    candidates.push(refinedQuality);
  }

  let best = candidates[0];
  for (const seed of candidates) {
    const refined = refineFixedWorkPoint(
      seed,
      spacing,
      lower,
      upper,
      evaluate,
      compareFixedWorkPoints,
      refinementTolerance,
    );
    if (compareFixedWorkPoints(refined, best) < 0) best = refined;
  }

  const localReviewTime = localOptimalReviewTime({
    ...normalized,
    horizon: totalWork,
  });
  const diagnostics = {
    gridPoints,
    refinementTolerance,
    endpointInset,
    approximate: true,
  };
  if (!best.feasible) {
    return {
      feasible: false,
      reviewTime: null,
      postReviewWork: null,
      reviewQuality: null,
      finalQuality: null,
      qualityMargin: null,
      evaluation: null,
      centeredEvaluation: null,
      totalWork,
      localReviewTime,
      bestAttempt: best,
      diagnostics,
    };
  }
  return {
    ...best,
    totalWork,
    localReviewTime,
    bestAttempt: null,
    diagnostics,
  };
}

/** Calculate the three evaluation axes and their supporting values for one task. */
export function evaluationAxes({
  qbar,
  k,
  h,
  totalWork,
  reviewWork,
  a,
  b,
  deadline,
  reviewTime,
  completionTime,
}) {
  positive(totalWork, "totalWork");
  positive(reviewWork, "reviewWork");
  positive(deadline, "deadline");
  positive(reviewTime, "reviewTime");
  positive(completionTime, "completionTime");
  if (reviewWork >= totalWork) {
    throw new RangeError("reviewWork must be smaller than totalWork.");
  }
  if (reviewTime >= completionTime) {
    throw new RangeError("reviewTime must be smaller than completionTime.");
  }
  if (completionTime > deadline) {
    throw new RangeError("completionTime must be at most deadline.");
  }

  const worker = { qbar, k, h };
  const manager = { a, b };
  const postReviewWork = totalWork - reviewWork;
  const reviewQuality = baselineQuality(reviewWork, worker);
  const finalQuality = reviewedQuality(reviewWork, postReviewWork, worker);
  const reviewExpectation = managerExpectation(reviewTime, manager);
  const completionExpectation = managerExpectation(completionTime, manager);
  const reviewScore = reviewQuality - reviewExpectation;
  const completionScore = finalQuality - completionExpectation;
  const evaluation = reviewEvaluation({
    reviewQuality,
    finalQuality,
    reviewTime,
    completionTime,
    a,
    b,
  });
  const preSlack = reviewTime - reviewWork;
  const postSlack = completionTime - reviewTime - postReviewWork;
  const deadlineSlack = deadline - completionTime;

  return {
    reviewQuality,
    finalQuality,
    totalWork,
    postReviewWork,
    reviewExpectation,
    completionExpectation,
    reviewScore,
    completionScore,
    evaluation,
    qualityMargin: finalQuality - MINIMUM_QUALITY,
    preSlack,
    postSlack,
    deadlineSlack,
    scheduleFeasible: preSlack >= 0 && postSlack >= 0 && deadlineSlack >= 0,
    meetsQualityStandard: finalQuality >= MINIMUM_QUALITY,
  };
}
