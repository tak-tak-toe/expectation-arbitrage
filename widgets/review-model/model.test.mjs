import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WORKER,
  baselineQuality,
  resetAmount,
  effectiveAge,
  reviewedQuality,
  qualityAtWork,
  baselineMarginalQuality,
  reviewedMarginalQuality,
  managerExpectation,
  reviewEvaluation,
} from "./model.js";

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

test("changing a shifts evaluation values equally and preserves their difference", () => {
  const caseOne = { reviewQuality: 60, finalQuality: 110, reviewTime: 5, completionTime: 15, b: 3 };
  const caseTwo = { reviewQuality: 70, finalQuality: 130, reviewTime: 10, completionTime: 25, b: 3 };
  const evaluation = (modelCase, a) => reviewEvaluation({ ...modelCase, a });
  close(evaluation(caseOne, 50) - evaluation(caseOne, 20), -30);
  close(evaluation(caseTwo, 50) - evaluation(caseTwo, 20), -30);
  close(evaluation(caseOne, 50) - evaluation(caseTwo, 50),
    evaluation(caseOne, 20) - evaluation(caseTwo, 20));
});

test("invalid inputs are rejected", () => {
  assert.throws(() => baselineQuality(-1), RangeError);
  assert.throws(() => baselineQuality(1, { qbar: 80, k: 0 }), RangeError);
  assert.throws(() => resetAmount(1, { h: 0 }), RangeError);
  assert.throws(() => reviewedQuality(1, -1), RangeError);
  assert.throws(() => qualityAtWork(1, -1), RangeError);
  assert.throws(() => managerExpectation(1, { a: 20, b: NaN }), RangeError);
});
