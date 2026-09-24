import test from "node:test";
import assert from "node:assert/strict";
import * as model from "./model.js";
import {
  DEADLINE,
  QUALITY_MINIMUM,
  DEFAULT_WORKER,
  DEFAULT_MANAGER,
  normalizeWorkerParameters,
  phi,
  phiPrime,
  phiSecond,
  initialWorkerState,
  propagateState,
  reviewEffectiveness,
  applyReview,
  advanceAndReview,
  simulateReviewIntervals,
  oneReviewOutcome,
  oneReviewFinalQuality,
  oneReviewDerivatives,
  oneReviewQualityForFixedTotal,
  fullResetBenchmarkQuality,
  expectation,
  reviewScore,
  sumReviewScores,
  weightedTwoReviewScore,
  twoReviewEvaluation,
  reviewScoreAtTime,
  optimalReviewScoreTime,
  qualityGainLogDerivative,
  optimalFullResetReviewTime,
  optimalQualityReviewTime,
  oneTaskObjectives,
  maximizeScalarDeterministic,
  optimalAggregateReviewTime,
} from "./model.js";

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Number.isFinite(actual), `${actual} is not finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} is not close to ${expected}`);
}

function numericDerivative(fn, value, step = 1e-5) {
  return (fn(value + step) - fn(value - step)) / (2 * step);
}

const DEFAULT_PARAMETERS = Object.freeze({
  worker: DEFAULT_WORKER,
  manager: DEFAULT_MANAGER,
  deadline: DEADLINE,
});

test("the public barrel exposes only the new notation and fixed constants", () => {
  assert.equal(DEADLINE, 25);
  assert.equal(QUALITY_MINIMUM, 100);
  assert.deepEqual(DEFAULT_WORKER, {
    qInfinity: 80,
    kappa: 0.25,
    rhoBar: 0.8,
    lambda: 0.25,
  });
  assert.deepEqual(DEFAULT_MANAGER, { e0: 20, beta: 3 });
  for (const removed of [
    "baselineQuality",
    "baselineMarginalQuality",
    "resetAmount",
    "effectiveAge",
    "reviewedQuality",
    "managerExpectation",
    "reviewEvaluation",
    "evaluationAxes",
    "localOptimalReviewTime",
    "optimalReviewTimeForFixedWork",
  ]) {
    assert.equal(removed in model, false, `${removed} remains in the public barrel`);
  }
});

test("Phi starts at zero, rises toward Q-infinity, and is strictly concave", () => {
  close(phi(0), 0);
  for (let work = 0; work < 25; work += 0.5) {
    assert.ok(phi(work + 0.5) > phi(work));
    assert.ok(phi(work + 0.5) < DEFAULT_WORKER.qInfinity);
    assert.ok(phiPrime(work) > 0);
    assert.ok(phiSecond(work) < 0);
    assert.ok(phiPrime(work + 0.5) < phiPrime(work));
  }
  close(numericDerivative(value => phi(value), 6), phiPrime(6), 1e-8);
});

test("unreviewed state propagation exactly recovers Phi and its productivity", () => {
  for (const work of [0, 0.1, 2, 8, 25]) {
    const state = propagateState(initialWorkerState(), work);
    close(state.quality, phi(work));
    close(state.productivity, Math.exp(-DEFAULT_WORKER.kappa * work));
    close(DEFAULT_WORKER.qInfinity * DEFAULT_WORKER.kappa * state.productivity,
      phiPrime(work));
  }
});

test("state propagation has the semigroup property between reviews", () => {
  const start = { quality: 17, productivity: 0.73 };
  const sequential = propagateState(propagateState(start, 3.2), 5.7);
  const combined = propagateState(start, 8.9);
  close(sequential.quality, combined.quality);
  close(sequential.productivity, combined.productivity);
});

test("review effectiveness has the required bounds and readiness interpretation", () => {
  close(reviewEffectiveness(0), 0);
  let preceding = -1;
  for (const work of [0, 0.1, 1, 4, 12, 50]) {
    const value = reviewEffectiveness(work);
    assert.ok(value >= 0 && value <= DEFAULT_WORKER.rhoBar);
    assert.ok(value >= preceding);
    preceding = value;
  }
  assert.ok(reviewEffectiveness(50) < DEFAULT_WORKER.rhoBar);
});

test("a review preserves quality and moves productivity toward one", () => {
  const before = { quality: 57, productivity: 0.2 };
  const unchanged = applyReview(before, 0);
  const partial = applyReview(before, 0.35);
  const full = applyReview(before, 1);
  close(unchanged.quality, before.quality);
  close(unchanged.productivity, before.productivity);
  close(partial.quality, before.quality);
  assert.ok(partial.productivity > before.productivity && partial.productivity < 1);
  close(full.quality, before.quality);
  close(full.productivity, 1);
});

test("advanceAndReview implements the stated recurrence, including zero-work reviews", () => {
  const state = { quality: 12, productivity: 0.6 };
  const event = advanceAndReview(state, 3);
  const expectedBefore = propagateState(state, 3);
  const expectedRho = reviewEffectiveness(3);
  assert.deepEqual(event.beforeReview, expectedBefore);
  close(event.effectiveness, expectedRho);
  close(event.afterReview.quality, expectedBefore.quality);
  close(event.afterReview.productivity,
    (1 - expectedRho) * expectedBefore.productivity + expectedRho);

  const zero = advanceAndReview(state, 0);
  close(zero.effectiveness, 0);
  assert.deepEqual(zero.beforeReview, state);
  assert.deepEqual(zero.afterReview, state);
});

test("the one-review state calculation equals the closed form", () => {
  for (const beforeWork of [0, 0.5, 6, 15, 25]) {
    for (const afterWork of [0, 0.5, 4, 19]) {
      const outcome = oneReviewOutcome(beforeWork, afterWork);
      const rho = reviewEffectiveness(beforeWork);
      const closedForm = (1 - rho) * phi(beforeWork + afterWork)
        + rho * (phi(beforeWork) + phi(afterWork));
      close(outcome.reviewQuality, phi(beforeWork));
      close(outcome.finalQuality, closedForm, 2e-12);
      close(outcome.qualityGain,
        rho * (phi(beforeWork) + phi(afterWork) - phi(beforeWork + afterWork)),
        2e-12);
      close(oneReviewFinalQuality(beforeWork, afterWork), outcome.finalQuality);
    }
  }
});

test("one-review analytic derivatives match centered finite differences", () => {
  for (const [beforeWork, afterWork] of [[1, 2], [6, 19], [14, 4]]) {
    const derivatives = oneReviewDerivatives(beforeWork, afterWork);
    close(derivatives.reviewQualityDx, phiPrime(beforeWork));
    close(derivatives.finalQualityDx,
      numericDerivative(value => oneReviewFinalQuality(value, afterWork), beforeWork),
      2e-8);
    close(derivatives.finalQualityDy,
      numericDerivative(value => oneReviewFinalQuality(beforeWork, value), afterWork),
      2e-8);
    close(derivatives.effectivenessDx,
      numericDerivative(value => reviewEffectiveness(value), beforeWork),
      2e-10);
  }
});

test("no-reset dynamics equal uninterrupted work for every review split", () => {
  const worker = { ...DEFAULT_WORKER, rhoBar: 0 };
  for (let beforeWork = 0; beforeWork <= DEADLINE; beforeWork += 0.5) {
    close(oneReviewQualityForFixedTotal(beforeWork, DEADLINE, worker),
      phi(DEADLINE, worker), 2e-12);
  }
});

test("the separate full-reset benchmark equals Phi(x)+Phi(y)", () => {
  for (const [beforeWork, afterWork] of [[0, 25], [4, 21], [12.5, 12.5]]) {
    close(fullResetBenchmarkQuality(beforeWork, afterWork),
      phi(beforeWork) + phi(afterWork));
  }
  const midpoint = fullResetBenchmarkQuality(12.5, 12.5);
  assert.ok(midpoint > fullResetBenchmarkQuality(12, 13));
  assert.ok(midpoint > fullResetBenchmarkQuality(0, 25));
});

test("rhoBar one with finite lambda remains distinct from the full-reset benchmark", () => {
  const worker = { ...DEFAULT_WORKER, rhoBar: 1, lambda: 0.25 };
  const maturityDependent = oneReviewFinalQuality(6, 19, worker);
  const constantFullReset = fullResetBenchmarkQuality(6, 19, worker);
  assert.ok(reviewEffectiveness(6, worker) < 1);
  assert.ok(maturityDependent < constantFullReset);
});

test("multi-review simulation follows the recurrence and leaves the final segment unreset", () => {
  const intervals = [2, 3.5, 0, 4];
  const finalWork = 5;
  const result = simulateReviewIntervals(intervals, finalWork);
  let manual = initialWorkerState();
  for (const deltaWork of intervals) {
    const before = propagateState(manual, deltaWork);
    manual = applyReview(before, reviewEffectiveness(deltaWork));
  }
  manual = propagateState(manual, finalWork);
  close(result.finalState.quality, manual.quality);
  close(result.finalState.productivity, manual.productivity);
  close(result.totalWork, intervals.reduce((sum, value) => sum + value, finalWork));
  assert.equal(result.reviewEvents.length, intervals.length);

  const one = simulateReviewIntervals([6], 19);
  const closed = oneReviewOutcome(6, 19);
  close(one.finalState.quality, closed.finalQuality);
  close(one.finalState.productivity, closed.finalState.productivity);
});

test("expectation, individual scores, sums, and weighted scores use the new notation", () => {
  close(expectation(0), DEFAULT_MANAGER.e0);
  close(expectation(10), 50);
  close(reviewScore(65, 10), 15);
  close(sumReviewScores([4, -2, 7]), 9);
  close(sumReviewScores([]), 0);
  close(weightedTwoReviewScore(10, 30, 0), 10);
  close(weightedTwoReviewScore(10, 30, 0.5), 20);
  close(weightedTwoReviewScore(10, 30, 1), 30);

  const evaluation = twoReviewEvaluation({
    reviewQuality: 65,
    finalQuality: 120,
    reviewTime: 10,
    finalTime: 25,
    manager: DEFAULT_MANAGER,
  });
  close(evaluation.intermediateScore, 15);
  close(evaluation.finalScore, 25);
  close(evaluation.totalScore, 40);
  close(evaluation.averageScore, 20);
});

test("Chapter 1 analytic interior optimum agrees with deterministic maximization", () => {
  const analytic = optimalReviewScoreTime(DEFAULT_PARAMETERS);
  const expected = Math.log(
    DEFAULT_WORKER.qInfinity * DEFAULT_WORKER.kappa / DEFAULT_MANAGER.beta,
  ) / DEFAULT_WORKER.kappa;
  close(analytic.reviewTime, expected);
  assert.equal(analytic.status, "interior");
  close(analytic.marginalQuality, DEFAULT_MANAGER.beta);

  const numerical = maximizeScalarDeterministic(
    time => reviewScoreAtTime(time, DEFAULT_PARAMETERS),
    0,
    DEADLINE,
    { gridPoints: 1001 },
  );
  close(numerical.bestTime, analytic.reviewTime, 2e-7);
});

test("Chapter 1 handles both boundaries and beta zero", () => {
  const initialSlope = phiPrime(0);
  const deadlineSlope = phiPrime(DEADLINE);
  const early = optimalReviewScoreTime({ beta: initialSlope + 1 });
  const exactEarly = optimalReviewScoreTime({ beta: initialSlope });
  const late = optimalReviewScoreTime({ beta: deadlineSlope / 2 });
  const exactLate = optimalReviewScoreTime({ beta: deadlineSlope });
  const flatExpectation = optimalReviewScoreTime({ beta: 0 });
  assert.equal(early.status, "early-boundary");
  assert.equal(exactEarly.status, "early-boundary");
  close(early.reviewTime, 0);
  assert.equal(late.status, "deadline-boundary");
  assert.equal(exactLate.status, "deadline-boundary");
  close(late.reviewTime, DEADLINE);
  close(flatExpectation.reviewTime, DEADLINE);
});

test("E0 shifts Chapter 1 scores without moving the optimum and beta moves it earlier", () => {
  const lowE0 = optimalReviewScoreTime({ e0: 0, beta: 3 });
  const highE0 = optimalReviewScoreTime({ e0: 70, beta: 3 });
  close(lowE0.reviewTime, highE0.reviewTime);
  close(highE0.score - lowE0.score, -70);
  assert.ok(optimalReviewScoreTime({ beta: 5 }).reviewTime
    < optimalReviewScoreTime({ beta: 2 }).reviewTime);
});

test("the Chapter 2 log derivative is strictly decreasing and vanishes at its optimum", () => {
  let preceding = Number.POSITIVE_INFINITY;
  for (let reviewWork = 0.25; reviewWork < DEADLINE; reviewWork += 0.25) {
    const value = qualityGainLogDerivative(reviewWork, DEADLINE);
    assert.ok(value < preceding);
    preceding = value;
  }
  const optimum = optimalQualityReviewTime(DEFAULT_PARAMETERS);
  assert.equal(optimum.status, "interior");
  assert.ok(optimum.reviewTime > DEADLINE / 2 && optimum.reviewTime < DEADLINE);
  close(qualityGainLogDerivative(optimum.reviewTime, DEADLINE), 0, 1e-11);
  assert.ok(optimum.finalQuality > phi(DEADLINE));
});

test("the full-reset quality optimum is exactly T/2", () => {
  const optimum = optimalFullResetReviewTime(DEFAULT_PARAMETERS);
  close(optimum.reviewTime, DEADLINE / 2);
  close(optimum.finalQuality,
    fullResetBenchmarkQuality(DEADLINE / 2, DEADLINE / 2));
  assert.equal(optimum.diagnostics.benchmark, "constant-full-reset");
  assert.equal(optimum.diagnostics.approximate, false);
});

test("lower lambda moves the partial-reset quality optimum later", () => {
  const slow = optimalQualityReviewTime({ lambda: 0.08 });
  const medium = optimalQualityReviewTime({ lambda: 0.25 });
  const fast = optimalQualityReviewTime({ lambda: 0.8 });
  assert.ok(slow.reviewTime > medium.reviewTime);
  assert.ok(medium.reviewTime > fast.reviewTime);
  assert.ok(fast.reviewTime > DEADLINE / 2);
});

test("positive rhoBar changes the gain amplitude but not quality-optimal timing", () => {
  const weak = optimalQualityReviewTime({ rhoBar: 0.1 });
  const strong = optimalQualityReviewTime({ rhoBar: 1 });
  close(weak.reviewTime, strong.reviewTime);
  assert.ok(strong.finalQuality - phi(DEADLINE)
    > weak.finalQuality - phi(DEADLINE));
});

test("rhoBar zero makes every Chapter 2 review time quality-indifferent", () => {
  const worker = { ...DEFAULT_WORKER, rhoBar: 0 };
  const optimum = optimalQualityReviewTime({ worker });
  assert.equal(optimum.reviewTime, null);
  assert.equal(optimum.status, "indifferent");
  assert.deepEqual(optimum.maximizingInterval, [0, DEADLINE]);
  for (const reviewWork of [0, 1, 9, 20, 25]) {
    close(oneReviewQualityForFixedTotal(reviewWork, DEADLINE, worker),
      optimum.finalQuality, 2e-12);
  }
});

test("legacy fixed-deadline model preserves sum/weighted identities", () => {
  const objectives = oneTaskObjectives(10, { ...DEFAULT_PARAMETERS, omega: 0.5 });
  close(objectives.intermediateScore,
    objectives.reviewQuality - expectation(10));
  close(objectives.finalScore,
    objectives.finalQuality - expectation(DEADLINE));
  close(objectives.totalScore,
    objectives.intermediateScore + objectives.finalScore);
  close(objectives.weightedScore, objectives.totalScore / 2);
  close(objectives.centeredTotalScore - objectives.totalScore,
    2 * DEFAULT_MANAGER.e0);
});

test("legacy omega endpoints reproduce Chapters 1 and 2", () => {
  const reviewOnly = optimalAggregateReviewTime({ ...DEFAULT_PARAMETERS, omega: 0 });
  const qualityOnly = optimalAggregateReviewTime({ ...DEFAULT_PARAMETERS, omega: 1 });
  close(reviewOnly.reviewTime,
    optimalReviewScoreTime(DEFAULT_PARAMETERS).reviewTime);
  close(qualityOnly.reviewTime,
    optimalQualityReviewTime(DEFAULT_PARAMETERS).reviewTime);
  assert.equal(reviewOnly.diagnostics.component, "intermediate-review-score");
  assert.equal(qualityOnly.diagnostics.component, "final-quality");
});

test("omega one preserves Chapter 2 indifference when rhoBar is zero", () => {
  const result = optimalAggregateReviewTime({
    worker: { ...DEFAULT_WORKER, rhoBar: 0 },
    manager: DEFAULT_MANAGER,
    omega: 1,
  });
  assert.equal(result.status, "indifferent");
  assert.equal(result.reviewTime, null);
  assert.deepEqual(result.maximizingInterval, [0, DEADLINE]);
});

test("omega one-half and the unscaled two-score sum have the same optimizer", () => {
  const weighted = optimalAggregateReviewTime({ ...DEFAULT_PARAMETERS, omega: 0.5 }, {
    gridPoints: 1601,
  });
  const total = maximizeScalarDeterministic(
    time => oneTaskObjectives(time, { ...DEFAULT_PARAMETERS, omega: 0.5 }).totalScore,
    0,
    DEADLINE,
    { gridPoints: 1601 },
  );
  close(weighted.reviewTime, total.bestTime, 2e-7);
  close(weighted.objectives.weightedScore * 2, weighted.objectives.totalScore);
});

test("the default aggregate optimum lies strictly between the two component optima", () => {
  const result = optimalAggregateReviewTime(DEFAULT_PARAMETERS, { gridPoints: 2001 });
  assert.ok(result.reviewOptimum.reviewTime < result.reviewTime);
  assert.ok(result.reviewTime < result.qualityOptimum.reviewTime);
  assert.equal(result.status, "resolved");
  assert.equal(result.uniqueness, "single-best-candidate-at-resolution");
  assert.equal(result.diagnostics.globalCertificate, false);
  close(result.reviewOptimum.reviewTime, 7.588479939543525, 1e-10);
  close(result.reviewTime, 10.684, 2e-3);
  close(result.qualityOptimum.reviewTime, 13.82416065241048, 2e-9);
});

test("E0 shifts legacy scores without moving the aggregate optimum", () => {
  const low = optimalAggregateReviewTime({ ...DEFAULT_PARAMETERS, e0: 0 }, {
    gridPoints: 1201,
  });
  const high = optimalAggregateReviewTime({ ...DEFAULT_PARAMETERS, e0: 75 }, {
    gridPoints: 1201,
  });
  close(low.reviewTime, high.reviewTime, 1e-12);
  close(high.objectives.weightedScore - low.objectives.weightedScore, -75, 1e-10);
  close(high.objectives.totalScore - low.objectives.totalScore, -150, 1e-10);
});

test("the scalar optimizer reports flat objectives and resolution-level ties honestly", () => {
  const flat = maximizeScalarDeterministic(() => 3, 0, 5, { gridPoints: 101 });
  assert.equal(flat.status, "indifferent");
  assert.equal(flat.bestTime, null);
  assert.deepEqual(flat.maximizingInterval, [0, 5]);
  assert.equal(flat.diagnostics.globalCertificate, false);

  const tied = maximizeScalarDeterministic(
    value => -((value * value - 1) ** 2),
    -2,
    2,
    { gridPoints: 801, tieTolerance: 1e-9 },
  );
  assert.equal(tied.status, "tied");
  assert.equal(tied.uniqueness, "multiple-best-candidates-at-resolution");
  assert.equal(tied.maximizers.length, 2);
  close(tied.maximizers[0].time, -1, 2e-7);
  close(tied.maximizers[1].time, 1, 2e-7);
  assert.equal(tied.diagnostics.globalCertificate, false);
});

test("the scalar optimizer is stable under large additive constants", () => {
  const centered = maximizeScalarDeterministic(
    value => -((value - 1) ** 2),
    -2,
    3,
    { gridPoints: 501 },
  );
  const shifted = maximizeScalarDeterministic(
    value => 1e12 - (value - 1) ** 2,
    -2,
    3,
    { gridPoints: 501 },
  );
  assert.equal(centered.status, "resolved");
  assert.equal(shifted.status, "resolved");
  close(centered.bestTime, 1, 2e-7);
  close(shifted.bestTime, 1, 2e-4);
});

test("the scalar optimizer rejects non-finite refinement values", () => {
  const finiteOnlyOnGrid = value => (Number.isInteger(value * 32)
    ? -((value - 0.5) ** 2)
    : Number.NaN);
  assert.throws(
    () => maximizeScalarDeterministic(finiteOnlyOnGrid, 0, 1, { gridPoints: 33 }),
    RangeError,
  );
});

test("parameter and domain validation rejects NaN, Infinity, and invalid ranges", () => {
  assert.throws(() => normalizeWorkerParameters({ qInfinity: 0 }), RangeError);
  assert.throws(() => normalizeWorkerParameters({ kappa: 0 }), RangeError);
  assert.throws(() => normalizeWorkerParameters({ rhoBar: 1.01 }), RangeError);
  assert.throws(() => normalizeWorkerParameters({ lambda: 0 }), RangeError);
  assert.throws(() => phi(-1), RangeError);
  assert.throws(() => propagateState({ quality: 0, productivity: 2 }, 1), RangeError);
  assert.throws(() => applyReview(initialWorkerState(), -0.1), RangeError);
  assert.throws(() => oneReviewOutcome(1, -1), RangeError);
  assert.throws(() => oneReviewQualityForFixedTotal(26, 25), RangeError);
  assert.throws(() => expectation(Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => expectation(1, { e0: -1, beta: 3 }), RangeError);
  assert.throws(() => weightedTwoReviewScore(1, 2, 2), RangeError);
  assert.throws(() => reviewScoreAtTime(26), RangeError);
  assert.throws(() => optimalAggregateReviewTime({ omega: -0.1 }), RangeError);
  assert.throws(() => maximizeScalarDeterministic(() => Number.NaN, 0, 1), RangeError);
});
