import test from "node:test";
import assert from "node:assert/strict";
import {
  DEADLINE,
  DEFAULT_WORKER,
  DEFAULT_MANAGER,
  baselineQuality,
  resetAmount,
  effectiveAge,
  reviewedQuality,
  qualityAtWork,
  baselineMarginalQuality,
  reviewedMarginalQuality,
  managerExpectation,
  reviewEvaluation,
  evaluationAxes,
  localReviewEvaluation,
  localOptimalReviewTime,
  fullEvaluationAtReviewTime,
  optimalReviewTimeForFixedWork,
} from "./model.js";
import { createReviewScenario } from "./widget.js";

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);
}

test("baseline starts at zero and increases toward qbar with decreasing slope", () => {
  close(baselineQuality(0), 0);
  for (let work = 0; work < 25; work += 0.5) {
    assert.ok(baselineQuality(work + 0.5) > baselineQuality(work));
    assert.ok(baselineQuality(work + 0.5) < DEFAULT_WORKER.qbar);
    assert.ok(baselineMarginalQuality(work + 0.5) < baselineMarginalQuality(work));
  }
});

test("reset is bounded and effective age equals x minus reset", () => {
  for (const h of [0.5, 4, 15]) {
    for (let work = 0; work <= 25; work += 0.5) {
      const reset = resetAmount(work, { h });
      assert.ok(reset >= 0 && reset <= work);
      close(effectiveAge(work, { h }), work - reset);
    }
  }
});

test("reviewed quality matches the defining expression and is continuous at review", () => {
  for (const before of [0, 0.5, 6, 24.5]) {
    close(reviewedQuality(before, 0), baselineQuality(before));
    close(qualityAtWork(before, before), baselineQuality(before));
    close(qualityAtWork(before + 1e-9, before), baselineQuality(before), 3e-8);
    for (const after of [0, 0.5, 10]) {
      const reset = resetAmount(before);
      const expression = baselineQuality(before) + baselineQuality(before + after - reset)
        - baselineQuality(before - reset);
      close(reviewedQuality(before, after), expression);
    }
  }
});

test("review does not reduce quality at equal total work across display horizons", () => {
  for (const qbar of [20, 50, 80, 100]) {
    for (const k of [0.05, 0.25, 1]) {
      for (const h of [0.5, 4, 15]) {
        const parameters = { qbar, k, h };
        for (const totalWork of [5, 25, 50]) {
          for (let before = 0.5; before < totalWork; before += 0.5) {
            const after = totalWork - before;
            assert.ok(reviewedQuality(before, after, parameters) + 1e-10
              >= baselineQuality(totalWork, parameters));
          }
        }
      }
    }
  }
});

test("review raises marginal improvement, not the instantaneous quality level", () => {
  for (const before of [0.5, 3, 6, 15]) {
    const oldSlope = baselineMarginalQuality(before);
    const newSlope = reviewedMarginalQuality(before, 0);
    assert.ok(newSlope > oldSlope);
    close(newSlope / oldSlope, Math.exp(DEFAULT_WORKER.k * resetAmount(before)), 1e-8);
    assert.ok(reviewedMarginalQuality(before, 2) < newSlope);
  }
});

test("quality may exceed 100; qbar at most 50 cannot attain 100 in finite sample times", () => {
  assert.ok(reviewedQuality(6, 19) > 100);
  for (const qbar of [20, 50]) {
    for (const totalWork of [5, 25, 50]) {
      for (const fraction of [0.1, 0.5, 0.9]) {
        const before = totalWork * fraction;
        const value = reviewedQuality(before, totalWork - before,
          { qbar, k: 0.25, h: 4 });
        assert.ok(value < 2 * qbar);
        assert.ok(value < 100);
      }
    }
  }
});

test("manager intercept shifts the line and slope determines changes over time", () => {
  close(managerExpectation(0, { a: 20, b: 3 }), 20);
  close(managerExpectation(10, { a: 20, b: 3 }), 50);
  close(managerExpectation(10, { a: 45, b: 1.5 }), 60);
  for (const time of [0, 10, 25]) {
    close(managerExpectation(time, { a: 50, b: 3 })
      - managerExpectation(time, { a: 20, b: 3 }), 30);
  }
  close(managerExpectation(11, { a: 20, b: 3 })
    - managerExpectation(10, { a: 20, b: 3 }), 3);
});

test("the local benchmark has the analytic interior slope-matching optimum", () => {
  const parameters = { qbar: 80, k: 0.25, a: 20, b: 3 };
  const optimum = localOptimalReviewTime(parameters);
  assert.ok(optimum > 0 && optimum < DEADLINE);
  close(baselineMarginalQuality(optimum, parameters), parameters.b, 1e-10);
  const epsilon = 0.01;
  assert.ok(localReviewEvaluation(optimum, parameters)
    >= localReviewEvaluation(optimum - epsilon, parameters));
  assert.ok(localReviewEvaluation(optimum, parameters)
    >= localReviewEvaluation(optimum + epsilon, parameters));
});

test("the local optimum handles both boundaries analytically", () => {
  const initialSlope = DEFAULT_WORKER.qbar * DEFAULT_WORKER.k;
  const deadlineSlope = initialSlope * Math.exp(-DEFAULT_WORKER.k * DEADLINE);
  close(localOptimalReviewTime({ ...DEFAULT_WORKER, b: initialSlope }), 0);
  close(localOptimalReviewTime({ ...DEFAULT_WORKER, b: initialSlope + 1 }), 0);
  close(localOptimalReviewTime({ ...DEFAULT_WORKER, b: deadlineSlope }), DEADLINE);
  close(localOptimalReviewTime({ ...DEFAULT_WORKER, b: 0 }), DEADLINE);
});

test("the local optimum accepts a shorter deadline or horizon", () => {
  const parameters = { ...DEFAULT_WORKER, b: 0 };
  close(localOptimalReviewTime({ ...parameters, deadline: 10 }), 10);
  close(localOptimalReviewTime({ ...parameters, horizon: 7.5 }), 7.5);
  close(localOptimalReviewTime(parameters), DEADLINE);

  const interior = localOptimalReviewTime({ ...DEFAULT_WORKER, b: 5, horizon: 12 });
  assert.ok(interior > 0 && interior < 12);
  close(baselineMarginalQuality(interior), 5, 1e-10);
});

test("higher b moves an interior local optimum earlier while a leaves it unchanged", () => {
  const common = { qbar: 80, k: 0.25 };
  const lowExpectationSlope = localOptimalReviewTime({ ...common, a: 0, b: 2 });
  const highExpectationSlope = localOptimalReviewTime({ ...common, a: 0, b: 5 });
  assert.ok(highExpectationSlope < lowExpectationSlope);
  close(localOptimalReviewTime({ ...common, a: 80, b: 5 }), highExpectationSlope);
  close(
    localReviewEvaluation(8, { ...common, a: 50, b: 5 })
      - localReviewEvaluation(8, { ...common, a: 20, b: 5 }),
    -30,
  );
});

test("fixed-work full evaluation matches the stated two-review objective", () => {
  const parameters = { ...DEFAULT_WORKER, ...DEFAULT_MANAGER, totalWork: 25 };
  const reviewWork = 6;
  const expected = reviewEvaluation({
    reviewQuality: baselineQuality(reviewWork, parameters),
    finalQuality: reviewedQuality(reviewWork, parameters.totalWork - reviewWork, parameters),
    reviewTime: reviewWork,
    completionTime: parameters.totalWork,
    a: parameters.a,
    b: parameters.b,
  });
  close(fullEvaluationAtReviewTime(reviewWork, parameters), expected);
  assert.ok(Number.isFinite(fullEvaluationAtReviewTime(0, parameters)));
  assert.ok(Number.isFinite(fullEvaluationAtReviewTime(25, parameters)));
});

test("fixed-work optimization returns a deterministic feasible interior point", () => {
  const parameters = { ...DEFAULT_WORKER, ...DEFAULT_MANAGER, totalWork: 25 };
  const first = optimalReviewTimeForFixedWork(parameters);
  const replay = optimalReviewTimeForFixedWork(parameters);
  assert.deepEqual(replay, first);
  assert.equal(first.feasible, true);
  assert.ok(first.reviewTime > 0 && first.reviewTime < first.totalWork);
  assert.ok(first.finalQuality >= 100);
  close(first.evaluation, fullEvaluationAtReviewTime(first.reviewTime, parameters), 1e-10);
  const epsilon = 1e-4;
  for (const neighbor of [first.reviewTime - epsilon, first.reviewTime + epsilon]) {
    const quality = reviewedQuality(neighbor, first.totalWork - neighbor, parameters);
    if (quality >= 100) {
      assert.ok(first.evaluation + 1e-8
        >= fullEvaluationAtReviewTime(neighbor, parameters));
    }
  }
});

test("fixed-work optimum is invariant to a and differs from the local benchmark", () => {
  const common = { ...DEFAULT_WORKER, b: 3, totalWork: 25 };
  const lowIntercept = optimalReviewTimeForFixedWork({ ...common, a: 10 });
  const highIntercept = optimalReviewTimeForFixedWork({ ...common, a: 60 });
  close(lowIntercept.reviewTime, highIntercept.reviewTime, 1e-12);
  close(highIntercept.evaluation - lowIntercept.evaluation, -50, 1e-10);
  assert.ok(Math.abs(lowIntercept.reviewTime - lowIntercept.localReviewTime) > 0.25);
});

test("fixed-work comparison keeps the local marker within W", () => {
  const result = optimalReviewTimeForFixedWork({
    ...DEFAULT_WORKER,
    ...DEFAULT_MANAGER,
    b: 0,
    totalWork: 12,
  });
  assert.equal(result.feasible, true);
  close(result.localReviewTime, 12);
  assert.ok(result.localReviewTime >= 0);
  assert.ok(result.localReviewTime <= result.totalWork);
});

test("fixed-work optimization reports an infeasible quality target without an optimum", () => {
  const result = optimalReviewTimeForFixedWork({
    qbar: 50,
    k: 0.25,
    h: 4,
    a: 20,
    b: 3,
    totalWork: 25,
  });
  assert.equal(result.feasible, false);
  assert.equal(result.reviewTime, null);
  assert.equal(result.evaluation, null);
  assert.ok(result.bestAttempt.finalQuality < 100);
  assert.ok(result.bestAttempt.reviewTime > 0);
  assert.ok(result.bestAttempt.reviewTime < result.totalWork);
});

test("fixed-work search keeps an interior numerical domain for a very small W", () => {
  const result = optimalReviewTimeForFixedWork({ totalWork: 1e-9 });
  assert.equal(result.feasible, false);
  assert.ok(result.bestAttempt.reviewTime > 0);
  assert.ok(result.bestAttempt.reviewTime < result.totalWork);
});

test("changing a shifts evaluation values equally and preserves their difference", () => {
  const caseOne = { reviewQuality: 60, finalQuality: 110, reviewTime: 5, completionTime: 15, b: 3 };
  const caseTwo = { reviewQuality: 70, finalQuality: 130, reviewTime: 10, completionTime: 25, b: 3 };
  const evaluation = (modelCase, a) => reviewEvaluation({ ...modelCase, a });
  close(evaluation(caseOne, 50) - evaluation(caseOne, 20), -30);
  close(evaluation(caseTwo, 50) - evaluation(caseTwo, 20), -30);
  close(evaluation(caseOne, 50) - evaluation(caseTwo, 50),
    evaluation(caseOne, 20) - evaluation(caseTwo, 20));
});

test("three evaluation axes combine the worker and manager settings", () => {
  const axes = evaluationAxes({
    qbar: 80,
    k: 0.25,
    h: 4,
    totalWork: 25,
    reviewWork: 6,
    a: 20,
    b: 3,
    deadline: 25,
    reviewTime: 6,
    completionTime: 25,
  });
  close(axes.reviewQuality, baselineQuality(6));
  close(axes.finalQuality, reviewedQuality(6, 19));
  close(axes.reviewExpectation, managerExpectation(6, { a: 20, b: 3 }));
  close(axes.completionExpectation, managerExpectation(25, { a: 20, b: 3 }));
  close(axes.reviewScore, axes.reviewQuality - axes.reviewExpectation);
  close(axes.completionScore, axes.finalQuality - axes.completionExpectation);
  close(axes.evaluation, (axes.reviewScore + axes.completionScore) / 2);
  close(axes.finalQuality, 118.89881537612908);
  close(axes.evaluation, 24.02420128212735);
  close(axes.totalWork, 25);
  close(axes.postReviewWork, 19);
  close(axes.preSlack, 0);
  close(axes.postSlack, 0);
  close(axes.deadlineSlack, 0);
  assert.equal(axes.scheduleFeasible, true);
  assert.equal(axes.meetsQualityStandard, true);
});

test("shared scenario publishes slider settings to every panel subscriber", () => {
  const scenario = createReviewScenario();
  const snapshots = [];
  const unsubscribe = scenario.subscribe(state => snapshots.push(state));
  scenario.update({ reviewWork: 7, reviewTime: 8 });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].reviewWork, 7);
  assert.equal(snapshots[0].reviewTime, 8);
  assert.equal(scenario.snapshot().completionTime, 25);
  unsubscribe();
  scenario.update({ reviewWork: 8 });
  assert.equal(snapshots.length, 1);
});

test("evaluation axes report calendar slack for the selected parameters", () => {
  const axes = evaluationAxes({
    qbar: 80,
    k: 0.25,
    h: 4,
    totalWork: 20,
    reviewWork: 6,
    a: 20,
    b: 3,
    deadline: 30,
    reviewTime: 8,
    completionTime: 25,
  });
  close(axes.preSlack, 2);
  close(axes.postSlack, 3);
  close(axes.deadlineSlack, 5);
  assert.equal(axes.scheduleFeasible, true);
  assert.equal(axes.meetsQualityStandard, true);

  const compressed = evaluationAxes({
    qbar: 80,
    k: 0.25,
    h: 4,
    totalWork: 25,
    reviewWork: 8,
    a: 20,
    b: 3,
    deadline: 25,
    reviewTime: 6,
    completionTime: 20,
  });
  assert.equal(compressed.scheduleFeasible, false);
  close(compressed.preSlack, -2);
  close(compressed.postSlack, -3);
  close(compressed.deadlineSlack, 5);
});

test("quality-standard status is separate from calendar feasibility", () => {
  const axes = evaluationAxes({
    qbar: 20,
    k: 0.25,
    h: 4,
    totalWork: 20,
    reviewWork: 6,
    a: 20,
    b: 3,
    deadline: 30,
    reviewTime: 8,
    completionTime: 25,
  });
  assert.equal(axes.scheduleFeasible, true);
  assert.equal(axes.meetsQualityStandard, false);
});

test("invalid inputs are rejected", () => {
  assert.throws(() => baselineQuality(-1), RangeError);
  assert.throws(() => baselineQuality(1, { qbar: 80, k: 0 }), RangeError);
  assert.throws(() => resetAmount(1, { h: 0 }), RangeError);
  assert.throws(() => reviewedQuality(1, -1), RangeError);
  assert.throws(() => qualityAtWork(1, -1), RangeError);
  assert.throws(() => managerExpectation(1, { a: 20, b: NaN }), RangeError);
  assert.throws(() => localReviewEvaluation(26), RangeError);
  assert.throws(() => localOptimalReviewTime({ qbar: 101, k: 0.25, b: 3 }), RangeError);
  assert.throws(() => localOptimalReviewTime({ horizon: 0 }), RangeError);
  assert.throws(() => localOptimalReviewTime({ deadline: 26 }), RangeError);
  assert.throws(() => fullEvaluationAtReviewTime(6, { totalWork: 26 }), RangeError);
  assert.throws(() => fullEvaluationAtReviewTime(26, { totalWork: 25 }), RangeError);
  assert.throws(() => optimalReviewTimeForFixedWork({ totalWork: 0 }), RangeError);
  assert.throws(() => optimalReviewTimeForFixedWork({}, { gridPoints: 10 }), RangeError);
  const scenario = {
    qbar: 80, k: 0.25, h: 4, totalWork: 25, reviewWork: 6,
    a: 20, b: 3, deadline: 25, reviewTime: 6, completionTime: 25,
  };
  assert.throws(() => evaluationAxes({ ...scenario, reviewWork: 25 }), RangeError);
  assert.throws(() => evaluationAxes({ ...scenario, reviewTime: 25 }), RangeError);
  assert.throws(() => evaluationAxes({ ...scenario, completionTime: 26 }), RangeError);
});
