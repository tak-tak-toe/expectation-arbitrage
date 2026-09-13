/** Pure worker-quality dynamics shared by every chapter. */

export const DEADLINE = 25;
export const QUALITY_MINIMUM = 100;

export const DEFAULT_WORKER = Object.freeze({
  qInfinity: 80,
  kappa: 0.25,
  rhoBar: 0.8,
  lambda: 0.25,
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

function unitInterval(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number in [0, 1].`);
  }
}

export function normalizeWorkerParameters(parameters = DEFAULT_WORKER) {
  const normalized = {
    qInfinity: parameters.qInfinity ?? DEFAULT_WORKER.qInfinity,
    kappa: parameters.kappa ?? DEFAULT_WORKER.kappa,
    rhoBar: parameters.rhoBar ?? DEFAULT_WORKER.rhoBar,
    lambda: parameters.lambda ?? DEFAULT_WORKER.lambda,
  };
  finitePositive(normalized.qInfinity, "qInfinity");
  finitePositive(normalized.kappa, "kappa");
  unitInterval(normalized.rhoBar, "rhoBar");
  finitePositive(normalized.lambda, "lambda");
  return normalized;
}

function normalizeState(state) {
  if (!state || typeof state !== "object") {
    throw new TypeError("state must be an object.");
  }
  const normalized = {
    quality: state.quality,
    productivity: state.productivity,
  };
  finiteNonnegative(normalized.quality, "state.quality");
  unitInterval(normalized.productivity, "state.productivity");
  return normalized;
}

export function phi(work, parameters = DEFAULT_WORKER) {
  finiteNonnegative(work, "work");
  const { qInfinity, kappa } = normalizeWorkerParameters(parameters);
  return qInfinity * -Math.expm1(-kappa * work);
}

export function phiPrime(work, parameters = DEFAULT_WORKER) {
  finiteNonnegative(work, "work");
  const { qInfinity, kappa } = normalizeWorkerParameters(parameters);
  return qInfinity * kappa * Math.exp(-kappa * work);
}

export function phiSecond(work, parameters = DEFAULT_WORKER) {
  finiteNonnegative(work, "work");
  const { qInfinity, kappa } = normalizeWorkerParameters(parameters);
  return -qInfinity * kappa * kappa * Math.exp(-kappa * work);
}

export function initialWorkerState() {
  return { quality: 0, productivity: 1 };
}

/** Advance quality and marginal-productivity state through an uninterrupted work interval. */
export function propagateState(state, deltaWork, parameters = DEFAULT_WORKER) {
  const current = normalizeState(state);
  finiteNonnegative(deltaWork, "deltaWork");
  const { qInfinity, kappa } = normalizeWorkerParameters(parameters);
  const decay = Math.exp(-kappa * deltaWork);
  return {
    quality: current.quality
      + qInfinity * current.productivity * -Math.expm1(-kappa * deltaWork),
    productivity: current.productivity * decay,
  };
}

/** Review readiness accumulated since the preceding review. */
export function reviewEffectiveness(workSinceReview, parameters = DEFAULT_WORKER) {
  finiteNonnegative(workSinceReview, "workSinceReview");
  const { rhoBar, lambda } = normalizeWorkerParameters(parameters);
  return rhoBar * -Math.expm1(-lambda * workSinceReview);
}

/** Apply feedback: quality remains continuous and only productivity recovers. */
export function applyReview(state, effectiveness) {
  const current = normalizeState(state);
  unitInterval(effectiveness, "effectiveness");
  return {
    quality: current.quality,
    productivity: (1 - effectiveness) * current.productivity + effectiveness,
  };
}

/** Propagate one interval ending in a feedback review. */
export function advanceAndReview(state, deltaWork, parameters = DEFAULT_WORKER) {
  const beforeReview = propagateState(state, deltaWork, parameters);
  const effectiveness = reviewEffectiveness(deltaWork, parameters);
  const afterReview = applyReview(beforeReview, effectiveness);
  return { deltaWork, beforeReview, effectiveness, afterReview };
}

/**
 * Simulate any fixed review sequence. Review intervals end in feedback events;
 * finalWork is propagated without adding an artificial terminal reset.
 */
export function simulateReviewIntervals(
  reviewIntervals,
  finalWork = 0,
  parameters = DEFAULT_WORKER,
) {
  if (!Array.isArray(reviewIntervals)) {
    throw new TypeError("reviewIntervals must be an array.");
  }
  finiteNonnegative(finalWork, "finalWork");
  normalizeWorkerParameters(parameters);

  const initialState = initialWorkerState();
  const reviewEvents = [];
  let state = initialState;
  let totalWork = 0;
  for (let index = 0; index < reviewIntervals.length; index += 1) {
    const deltaWork = reviewIntervals[index];
    finiteNonnegative(deltaWork, `reviewIntervals[${index}]`);
    const event = advanceAndReview(state, deltaWork, parameters);
    reviewEvents.push({ index: index + 1, ...event });
    state = event.afterReview;
    totalWork += deltaWork;
  }
  const finalState = propagateState(state, finalWork, parameters);
  totalWork += finalWork;
  return {
    initialState,
    reviewEvents,
    finalWork,
    finalState,
    totalWork,
  };
}

/** State-based one-feedback-review calculation. */
export function oneReviewOutcome(beforeWork, afterWork, parameters = DEFAULT_WORKER) {
  finiteNonnegative(beforeWork, "beforeWork");
  finiteNonnegative(afterWork, "afterWork");
  const worker = normalizeWorkerParameters(parameters);
  const beforeReviewState = propagateState(initialWorkerState(), beforeWork, worker);
  const effectiveness = reviewEffectiveness(beforeWork, worker);
  const afterReviewState = applyReview(beforeReviewState, effectiveness);
  const finalState = propagateState(afterReviewState, afterWork, worker);
  const baselineFinalQuality = phi(beforeWork + afterWork, worker);
  return {
    beforeWork,
    afterWork,
    reviewQuality: beforeReviewState.quality,
    preReviewProductivity: beforeReviewState.productivity,
    effectiveness,
    postReviewProductivity: afterReviewState.productivity,
    finalQuality: finalState.quality,
    baselineFinalQuality,
    qualityGain: finalState.quality - baselineFinalQuality,
    beforeReviewState,
    afterReviewState,
    finalState,
  };
}

export function oneReviewFinalQuality(beforeWork, afterWork, parameters = DEFAULT_WORKER) {
  return oneReviewOutcome(beforeWork, afterWork, parameters).finalQuality;
}

/** Analytic partial derivatives for the one-review final-quality function Q(x, y). */
export function oneReviewDerivatives(beforeWork, afterWork, parameters = DEFAULT_WORKER) {
  finiteNonnegative(beforeWork, "beforeWork");
  finiteNonnegative(afterWork, "afterWork");
  const worker = normalizeWorkerParameters(parameters);
  const { qInfinity, kappa, rhoBar, lambda } = worker;
  const preReviewProductivity = Math.exp(-kappa * beforeWork);
  const afterDecay = Math.exp(-kappa * afterWork);
  const effectiveness = reviewEffectiveness(beforeWork, worker);
  const effectivenessDx = rhoBar * lambda * Math.exp(-lambda * beforeWork);
  const postReviewProductivity = preReviewProductivity
    + effectiveness * (1 - preReviewProductivity);
  const postReviewProductivityDx = -(1 - effectiveness)
      * kappa * preReviewProductivity
    + effectivenessDx * (1 - preReviewProductivity);

  return {
    reviewQualityDx: qInfinity * kappa * preReviewProductivity,
    effectivenessDx,
    postReviewProductivityDx,
    finalQualityDx: qInfinity * kappa * preReviewProductivity
      + qInfinity * postReviewProductivityDx * (1 - afterDecay),
    finalQualityDy: qInfinity * kappa * postReviewProductivity * afterDecay,
  };
}

/** The maturity-dependent model evaluated on the fixed-work line y = T - x. */
export function oneReviewQualityForFixedTotal(
  reviewWork,
  totalWork = DEADLINE,
  parameters = DEFAULT_WORKER,
) {
  finiteNonnegative(totalWork, "totalWork");
  finiteNonnegative(reviewWork, "reviewWork");
  if (reviewWork > totalWork) {
    throw new RangeError("reviewWork must be at most totalWork.");
  }
  return oneReviewFinalQuality(reviewWork, totalWork - reviewWork, parameters);
}

/** A separate theoretical benchmark in which every review fully restores p to one. */
export function fullResetBenchmarkQuality(
  beforeWork,
  afterWork,
  parameters = DEFAULT_WORKER,
) {
  finiteNonnegative(beforeWork, "beforeWork");
  finiteNonnegative(afterWork, "afterWork");
  const worker = normalizeWorkerParameters(parameters);
  return phi(beforeWork, worker) + phi(afterWork, worker);
}
