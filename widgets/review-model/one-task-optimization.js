/** Pure one-task objectives and deterministic one-dimensional optimizers. */

import {
  DEADLINE,
  DEFAULT_WORKER,
  normalizeWorkerParameters,
  phi,
  phiPrime,
  oneReviewOutcome,
  oneReviewQualityForFixedTotal,
  fullResetBenchmarkQuality,
} from "./worker-core.js";
import {
  DEFAULT_MANAGER,
  normalizeManagerParameters,
  expectation,
  reviewScore,
  twoReviewEvaluation,
} from "./evaluation-core.js";

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

function unitInterval(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number in [0, 1].`);
  }
}

export function normalizeOneTaskParameters(parameters = {}) {
  const worker = normalizeWorkerParameters({
    ...(parameters.worker ?? {}),
    qInfinity: parameters.qInfinity ?? parameters.worker?.qInfinity,
    kappa: parameters.kappa ?? parameters.worker?.kappa,
    rhoBar: parameters.rhoBar ?? parameters.worker?.rhoBar,
    lambda: parameters.lambda ?? parameters.worker?.lambda,
  });
  const manager = normalizeManagerParameters({
    ...(parameters.manager ?? {}),
    e0: parameters.e0 ?? parameters.manager?.e0,
    beta: parameters.beta ?? parameters.manager?.beta,
  });
  const deadline = parameters.deadline ?? DEADLINE;
  const omega = parameters.omega ?? 0.5;
  finitePositive(deadline, "deadline");
  unitInterval(omega, "omega");
  return { worker, manager, deadline, omega };
}

function timeInHorizon(time, deadline, name = "time") {
  finiteNonnegative(time, name);
  if (time > deadline) {
    throw new RangeError(`${name} must be at most deadline.`);
  }
}

/** Chapter 1 objective S(tau) = Phi(tau) - E(tau). */
export function reviewScoreAtTime(time, parameters = {}) {
  const { worker, manager, deadline } = normalizeOneTaskParameters(parameters);
  timeInHorizon(time, deadline);
  return reviewScore(phi(time, worker), time, manager);
}

/** Analytic global maximizer of the strictly concave Chapter 1 objective. */
export function optimalReviewScoreTime(parameters = {}) {
  const { worker, manager, deadline } = normalizeOneTaskParameters(parameters);
  const initialSlope = phiPrime(0, worker);
  const deadlineSlope = phiPrime(deadline, worker);
  const scale = Math.max(1, initialSlope, manager.beta);
  const tolerance = 32 * Number.EPSILON * scale;
  let reviewTime;
  let status;

  if (manager.beta >= initialSlope - tolerance) {
    reviewTime = 0;
    status = "early-boundary";
  } else if (manager.beta <= deadlineSlope + tolerance) {
    reviewTime = deadline;
    status = "deadline-boundary";
  } else {
    reviewTime = Math.log(initialSlope / manager.beta) / worker.kappa;
    status = "interior";
  }

  return {
    reviewTime,
    status,
    score: reviewScoreAtTime(reviewTime, { worker, manager, deadline }),
    marginalQuality: phiPrime(reviewTime, worker),
    expectationSlope: manager.beta,
    uniqueness: "theoretically-unique",
    diagnostics: {
      method: "analytic-strict-concavity",
      approximate: false,
      globalCertificate: true,
    },
  };
}

function positiveHazard(rate, amount) {
  if (amount === 0) return Number.POSITIVE_INFINITY;
  const exponent = rate * amount;
  if (exponent > 709) return 0;
  return rate / Math.expm1(exponent);
}

/** Log derivative of the positive Chapter 2 quality-gain factor. */
export function qualityGainLogDerivative(reviewWork, totalWork, parameters = DEFAULT_WORKER) {
  finitePositive(totalWork, "totalWork");
  timeInHorizon(reviewWork, totalWork, "reviewWork");
  const worker = normalizeWorkerParameters(parameters);
  if (reviewWork === 0) return Number.POSITIVE_INFINITY;
  if (reviewWork === totalWork) return Number.NEGATIVE_INFINITY;
  return positiveHazard(worker.lambda, reviewWork)
    + positiveHazard(worker.kappa, reviewWork)
    - positiveHazard(worker.kappa, totalWork - reviewWork);
}

/** Theoretical rho=1 benchmark, kept separate from the maturity-dependent model. */
export function optimalFullResetReviewTime(parameters = {}) {
  const { worker, deadline } = normalizeOneTaskParameters(parameters);
  const reviewTime = deadline / 2;
  return {
    reviewTime,
    status: "interior",
    finalQuality: fullResetBenchmarkQuality(reviewTime, deadline - reviewTime, worker),
    uniqueness: "theoretically-unique",
    diagnostics: {
      method: "analytic-symmetry-and-strict-concavity",
      benchmark: "constant-full-reset",
      approximate: false,
      globalCertificate: true,
    },
  };
}

/** Chapter 2 quality optimum for maturity-dependent review effectiveness. */
export function optimalQualityReviewTime(parameters = {}, options = {}) {
  const { worker, deadline } = normalizeOneTaskParameters(parameters);
  const tolerance = options.tolerance ?? Math.max(1e-12, deadline * 1e-12);
  const maxIterations = options.maxIterations ?? 160;
  finitePositive(tolerance, "tolerance");
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RangeError("maxIterations must be a positive integer.");
  }

  if (worker.rhoBar === 0) {
    return {
      reviewTime: null,
      status: "indifferent",
      finalQuality: phi(deadline, worker),
      maximizingInterval: [0, deadline],
      uniqueness: "indifferent",
      diagnostics: {
        method: "analytic-zero-review-effect",
        iterations: 0,
        approximate: false,
        globalCertificate: true,
      },
    };
  }

  let lower = deadline / 2;
  let upper = deadline;
  let iterations = 0;
  while (upper - lower > tolerance && iterations < maxIterations) {
    const middle = (lower + upper) / 2;
    if (qualityGainLogDerivative(middle, deadline, worker) > 0) lower = middle;
    else upper = middle;
    iterations += 1;
  }
  const reviewTime = (lower + upper) / 2;
  return {
    reviewTime,
    status: "interior",
    finalQuality: oneReviewQualityForFixedTotal(reviewTime, deadline, worker),
    fullResetBenchmarkTime: deadline / 2,
    uniqueness: "theoretically-unique",
    diagnostics: {
      method: "monotone-log-derivative-bisection",
      iterations,
      tolerance,
      approximate: true,
      globalCertificate: true,
    },
  };
}

/** Chapter 3 component scores at a candidate intermediate-review time. */
export function oneTaskObjectives(reviewTime, parameters = {}) {
  const { worker, manager, deadline, omega } = normalizeOneTaskParameters(parameters);
  timeInHorizon(reviewTime, deadline, "reviewTime");
  const outcome = oneReviewOutcome(reviewTime, deadline - reviewTime, worker);
  const evaluation = twoReviewEvaluation({
    reviewQuality: outcome.reviewQuality,
    finalQuality: outcome.finalQuality,
    reviewTime,
    finalTime: deadline,
    manager,
    omega,
  });
  const centeredIntermediateScore = outcome.reviewQuality - manager.beta * reviewTime;
  const centeredFinalScore = outcome.finalQuality - manager.beta * deadline;
  return {
    reviewTime,
    postReviewWork: deadline - reviewTime,
    reviewQuality: outcome.reviewQuality,
    finalQuality: outcome.finalQuality,
    effectiveness: outcome.effectiveness,
    ...evaluation,
    centeredIntermediateScore,
    centeredFinalScore,
    centeredTotalScore: centeredIntermediateScore + centeredFinalScore,
    centeredWeightedScore: (1 - omega) * centeredIntermediateScore
      + omega * centeredFinalScore,
    outcome,
  };
}

function evaluateObjective(fn, time, counter) {
  const value = fn(time);
  counter.count += 1;
  if (!Number.isFinite(value)) {
    throw new RangeError("fn must return a finite number throughout the search interval.");
  }
  return value;
}

function goldenSectionMaximum(fn, lower, upper, tolerance, maxIterations, counter) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let left = lower;
  let right = upper;
  let c = right - ratio * (right - left);
  let d = left + ratio * (right - left);
  let fc = evaluateObjective(fn, c, counter);
  let fd = evaluateObjective(fn, d, counter);
  let iterations = 0;

  while (right - left > tolerance && iterations < maxIterations) {
    if (fc >= fd) {
      right = d;
      d = c;
      fd = fc;
      c = right - ratio * (right - left);
      fc = evaluateObjective(fn, c, counter);
    } else {
      left = c;
      c = d;
      fc = fd;
      d = left + ratio * (right - left);
      fd = evaluateObjective(fn, d, counter);
    }
    iterations += 1;
  }

  const time = fc >= fd ? c : d;
  return { time, value: Math.max(fc, fd), iterations };
}

/**
 * Deterministic grid discovery followed by local golden-section refinement.
 * It reports resolution-level uniqueness and never claims a global certificate.
 */
export function maximizeScalarDeterministic(fn, lower, upper, options = {}) {
  if (typeof fn !== "function") throw new TypeError("fn must be a function.");
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper) {
    throw new RangeError("lower and upper must be finite with lower < upper.");
  }
  const gridPoints = options.gridPoints ?? 4001;
  const refinementTolerance = options.refinementTolerance
    ?? Math.max(1e-10, (upper - lower) * 1e-10);
  const maxRefinementIterations = options.maxRefinementIterations ?? 120;
  if (!Number.isInteger(gridPoints) || gridPoints < 33) {
    throw new RangeError("gridPoints must be an integer of at least 33.");
  }
  finitePositive(refinementTolerance, "refinementTolerance");
  if (!Number.isInteger(maxRefinementIterations) || maxRefinementIterations < 1) {
    throw new RangeError("maxRefinementIterations must be a positive integer.");
  }

  const spacing = (upper - lower) / (gridPoints - 1);
  const grid = [];
  const counter = { count: 0 };
  let minimumValue = Number.POSITIVE_INFINITY;
  let maximumValue = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < gridPoints; index += 1) {
    const time = lower + spacing * index;
    const value = evaluateObjective(fn, time, counter);
    grid.push({ time, value, index });
    minimumValue = Math.min(minimumValue, value);
    maximumValue = Math.max(maximumValue, value);
  }

  const scale = Math.max(1, Math.abs(minimumValue), Math.abs(maximumValue));
  // Scale only for floating-point roundoff, not as a relative optimization
  // tolerance: a large additive constant must not erase real variation.
  const roundoffTolerance = 8 * Number.EPSILON * scale;
  const flatTolerance = options.flatTolerance
    ?? Math.max(1e-12, roundoffTolerance);
  const tieTolerance = options.tieTolerance
    ?? Math.max(1e-10, 2 * roundoffTolerance);
  finiteNonnegative(flatTolerance, "flatTolerance");
  finiteNonnegative(tieTolerance, "tieTolerance");
  if (maximumValue - minimumValue <= flatTolerance) {
    return {
      bestTime: null,
      bestValue: minimumValue + (maximumValue - minimumValue) / 2,
      maximizers: [],
      status: "indifferent",
      uniqueness: "indifferent",
      maximizingInterval: [lower, upper],
      diagnostics: {
        method: "deterministic-grid-and-golden-refinement",
        gridPoints,
        evaluations: counter.count,
        objectiveSpread: maximumValue - minimumValue,
        flatTolerance,
        tieTolerance,
        approximate: true,
        globalCertificate: false,
      },
    };
  }

  const seeds = [grid[0], grid[grid.length - 1]];
  for (let index = 1; index < grid.length - 1; index += 1) {
    if (grid[index].value >= grid[index - 1].value
        && grid[index].value >= grid[index + 1].value) {
      seeds.push(grid[index]);
    }
  }

  const candidates = [];
  let totalRefinementIterations = 0;
  for (const seed of seeds) {
    if (seed.index === 0 || seed.index === grid.length - 1) {
      candidates.push({ time: seed.time, value: seed.value });
      continue;
    }
    const refined = goldenSectionMaximum(
      fn,
      grid[seed.index - 1].time,
      grid[seed.index + 1].time,
      refinementTolerance,
      maxRefinementIterations,
      counter,
    );
    totalRefinementIterations += refined.iterations;
    // Preserve the sampled seed on a numerically flat peak. Replacing it with
    // an equal-valued refinement would choose an arbitrary edge of the plateau.
    candidates.push(refined.value > seed.value
      ? { time: refined.time, value: refined.value }
      : { time: seed.time, value: seed.value });
  }

  candidates.sort((left, right) => right.value - left.value || left.time - right.time);
  const bestCandidate = candidates[0];
  const bestValue = bestCandidate.value;
  const tiedAtResolution = candidates
    .filter(candidate => bestValue - candidate.value <= tieTolerance)
    .sort((left, right) => left.time - right.time);
  const tied = [];
  for (const candidate of tiedAtResolution) {
    const preceding = tied[tied.length - 1];
    if (!preceding
        || Math.abs(candidate.time - preceding.time) > refinementTolerance * 4) {
      tied.push(candidate);
    }
  }
  const status = tied.length === 1 ? "resolved" : "tied";

  return {
    bestTime: bestCandidate.time,
    bestValue,
    maximizers: tied,
    status,
    uniqueness: tied.length === 1
      ? "single-best-candidate-at-resolution"
      : "multiple-best-candidates-at-resolution",
    maximizingInterval: null,
    diagnostics: {
      method: "deterministic-grid-and-golden-refinement",
      gridPoints,
      localCandidates: candidates.length,
      evaluations: counter.count,
      refinementIterations: totalRefinementIterations,
      refinementTolerance,
      objectiveSpread: maximumValue - minimumValue,
      flatTolerance,
      tieTolerance,
      approximate: true,
      globalCertificate: false,
    },
  };
}

function exactAggregateResult(reviewTime, status, uniqueness, diagnostics, parameters) {
  const objectives = oneTaskObjectives(reviewTime, parameters);
  return {
    reviewTime,
    status,
    uniqueness,
    maximizers: [{ time: reviewTime, value: objectives.weightedScore }],
    maximizingInterval: null,
    objectives,
    diagnostics,
  };
}

/** Chapter 3 weighted aggregate optimum. */
export function optimalAggregateReviewTime(parameters = {}, options = {}) {
  const normalized = normalizeOneTaskParameters(parameters);
  const normalizedParameters = normalized;
  const reviewOptimum = optimalReviewScoreTime(normalizedParameters);
  const qualityOptimum = optimalQualityReviewTime(normalizedParameters, options.qualityOptions);

  if (normalized.omega === 0) {
    return {
      ...exactAggregateResult(
        reviewOptimum.reviewTime,
        reviewOptimum.status,
        reviewOptimum.uniqueness,
        { ...reviewOptimum.diagnostics, component: "intermediate-review-score" },
        normalizedParameters,
      ),
      reviewOptimum,
      qualityOptimum,
    };
  }

  if (normalized.omega === 1) {
    if (qualityOptimum.status === "indifferent") {
      return {
        reviewTime: null,
        status: "indifferent",
        uniqueness: "indifferent",
        maximizers: [],
        maximizingInterval: [0, normalized.deadline],
        objectives: null,
        reviewOptimum,
        qualityOptimum,
        diagnostics: {
          ...qualityOptimum.diagnostics,
          component: "final-quality",
        },
      };
    }
    return {
      ...exactAggregateResult(
        qualityOptimum.reviewTime,
        qualityOptimum.status,
        qualityOptimum.uniqueness,
        { ...qualityOptimum.diagnostics, component: "final-quality" },
        normalizedParameters,
      ),
      reviewOptimum,
      qualityOptimum,
    };
  }

  const search = maximizeScalarDeterministic(
    time => oneTaskObjectives(time, normalizedParameters).centeredWeightedScore,
    0,
    normalized.deadline,
    options,
  );
  if (search.status === "indifferent") {
    return {
      reviewTime: null,
      status: search.status,
      uniqueness: search.uniqueness,
      maximizers: [],
      maximizingInterval: search.maximizingInterval,
      objectives: null,
      reviewOptimum,
      qualityOptimum,
      diagnostics: search.diagnostics,
    };
  }

  const objectives = oneTaskObjectives(search.bestTime, normalizedParameters);
  const maximizers = search.maximizers.map(candidate => ({
    time: candidate.time,
    value: oneTaskObjectives(candidate.time, normalizedParameters).weightedScore,
  }));
  return {
    reviewTime: search.bestTime,
    status: search.status,
    uniqueness: search.uniqueness,
    maximizers,
    maximizingInterval: null,
    objectives,
    reviewOptimum,
    qualityOptimum,
    diagnostics: search.diagnostics,
  };
}
