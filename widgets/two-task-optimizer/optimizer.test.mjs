import test from "node:test";
import assert from "node:assert/strict";
import { phi, oneReviewOutcome, expectation } from "../review-model/model.js";
import {
  DEADLINE,
  Q_MINIMUM,
  MIN_PHASE,
  DEFAULT_TWO_TASK_PARAMETERS,
  PHASE_ORDERS,
  buildSchedule,
  delayCoefficients,
  normalizeParameters,
  evaluateSchedule,
  evaluateFixedOrderNlp,
  qualityAtCalendarTime,
  expectationAtCalendarTime,
} from "./model.js";
import {
  DEFAULT_NLP_OPTIONS,
  normalizeNlpOptions,
  projectDurations,
  kktDiagnostics,
} from "./nlp.js";
import {
  DEFAULT_OPTIMIZER_OPTIONS,
  SOLVER_STATUS_LABELS,
  compareCandidates,
  minimumQualityWorkPair,
  normalizeOptimizerOptions,
  optimizeTwoTasks,
} from "./optimizer.js";

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} is not close to ${expected}`);
}

function parametersWith(changes = {}) {
  return {
    worker: { ...DEFAULT_TWO_TASK_PARAMETERS.worker, ...changes.worker },
    managers: {
      A: { ...DEFAULT_TWO_TASK_PARAMETERS.managers.A, ...changes.A },
      B: { ...DEFAULT_TWO_TASK_PARAMETERS.managers.B, ...changes.B },
    },
    taskWeights: {
      ...DEFAULT_TWO_TASK_PARAMETERS.taskWeights,
      ...changes.taskWeights,
    },
  };
}

test("the six orders are unique and respect both precedence constraints", () => {
  assert.equal(PHASE_ORDERS.length, 6);
  assert.equal(new Set(PHASE_ORDERS.map(order => order.join(""))).size, 6);
  for (const order of PHASE_ORDERS) {
    assert.deepEqual([...order].sort(), ["A1", "A2", "B1", "B2"]);
    assert.ok(order.indexOf("A1") < order.indexOf("A2"));
    assert.ok(order.indexOf("B1") < order.indexOf("B2"));
  }
});

test("a phase order determines review and completion times", () => {
  const schedule = buildSchedule(["A1", "B1", "A2", "B2"], [2, 3, 5, 7]);
  close(schedule.reviewTimes.A, 2);
  close(schedule.completionTimes.A, 10);
  close(schedule.reviewTimes.B, 7);
  close(schedule.completionTimes.B, 17);
  close(schedule.totalWork, 17);
  close(schedule.idleTime, 8);
  assert.deepEqual(schedule.phases.map(phase => [phase.phase, phase.start, phase.end]), [
    ["A1", 0, 2],
    ["B1", 2, 7],
    ["A2", 7, 10],
    ["B2", 10, 17],
  ]);
});

test("delay coefficients reproduce the hand-derived example", () => {
  const managers = { A: { e0: 0, beta: 5 }, B: { e0: 0, beta: 2.5 } };
  const result = delayCoefficients(["A1", "B1", "A2", "B2"], managers);
  assert.deepEqual(result.vector, [15, 7.5, 10, 2.5]);
  assert.deepEqual(result.byPhase, { A1: 15, A2: 7.5, B1: 10, B2: 2.5 });
});

test("schedule evaluation uses the common quality and score definitions", () => {
  const durations = [2, 3, 5, 7];
  const result = evaluateSchedule(
    ["A1", "B1", "A2", "B2"],
    durations,
    DEFAULT_TWO_TASK_PARAMETERS,
  );
  const expectedA = oneReviewOutcome(2, 3, DEFAULT_TWO_TASK_PARAMETERS.worker);
  close(result.tasks.A.reviewQuality, phi(2, DEFAULT_TWO_TASK_PARAMETERS.worker));
  close(result.tasks.A.finalQuality, expectedA.finalQuality);
  close(result.tasks.A.scores.review,
    result.tasks.A.reviewQuality - expectation(
      result.tasks.A.tau,
      DEFAULT_TWO_TASK_PARAMETERS.managers.A,
    ));
  close(result.tasks.A.J, result.tasks.A.scores.review + result.tasks.A.scores.final);
  close(result.overallJ, result.tasks.A.weightedJ + result.tasks.B.weightedJ);
  close(result.tasks.A.centeredJ, result.tasks.A.J
    + 2 * DEFAULT_TWO_TASK_PARAMETERS.managers.A.e0);
  close(result.overallCenteredJ,
    result.tasks.A.weightedCenteredJ + result.tasks.B.weightedCenteredJ);
});

test("partial two-task parameters inherit the shared core defaults", () => {
  const normalized = normalizeParameters({
    worker: { qInfinity: 75 },
    managers: { A: { beta: 4 } },
    taskWeights: { A: 2 },
  });
  assert.deepEqual(normalized.worker, {
    ...DEFAULT_TWO_TASK_PARAMETERS.worker,
    qInfinity: 75,
  });
  assert.deepEqual(normalized.managers.A, {
    ...DEFAULT_TWO_TASK_PARAMETERS.managers.A,
    beta: 4,
  });
  assert.deepEqual(normalized.managers.B, DEFAULT_TWO_TASK_PARAMETERS.managers.B);
  assert.deepEqual(normalized.taskWeights, { A: 2, B: 1 });
});

test("calendar quality plateaus while the other task is active", () => {
  const schedule = buildSchedule(["A1", "B1", "A2", "B2"], [2, 3, 5, 7]);
  const atReview = qualityAtCalendarTime(schedule, "A", 2);
  close(qualityAtCalendarTime(schedule, "A", 4), atReview);
  close(qualityAtCalendarTime(schedule, "A", 7), atReview);
  assert.ok(qualityAtCalendarTime(schedule, "A", 8) > atReview);
  close(
    expectationAtCalendarTime("A", 7) - expectationAtCalendarTime("A", 2),
    25,
  );
});

test("analytic fixed-order gradients agree with centered finite differences", () => {
  const durations = [5.8, 4.6, 6.1, 4.9];
  const step = 1e-5;
  for (const order of PHASE_ORDERS) {
    const analytic = evaluateFixedOrderNlp(order, durations);
    for (let dimension = 0; dimension < durations.length; dimension += 1) {
      const left = [...durations];
      const right = [...durations];
      left[dimension] -= step;
      right[dimension] += step;
      const leftPoint = evaluateFixedOrderNlp(order, left);
      const rightPoint = evaluateFixedOrderNlp(order, right);
      const numericalObjective = (
        rightPoint.minimizationObjective - leftPoint.minimizationObjective
      ) / (2 * step);
      close(analytic.objectiveGradient[dimension], numericalObjective, 2e-6);
      for (let constraint = 0; constraint < analytic.constraintValues.length; constraint += 1) {
        const numericalConstraint = (
          rightPoint.constraintValues[constraint] - leftPoint.constraintValues[constraint]
        ) / (2 * step);
        close(
          analytic.constraintJacobian[constraint][dimension],
          numericalConstraint,
          2e-6,
        );
      }
    }
  }
});

test("duration projection enforces phase bounds and the common deadline", () => {
  const projected = projectDurations([-3, 30, 8, 9]);
  assert.ok(projected.every(value => value >= MIN_PHASE - 1e-12));
  close(projected.reduce((sum, value) => sum + value, 0), DEADLINE, 1e-10);
  assert.deepEqual(projectDurations([1, 2, 3, 4]), [1, 2, 3, 4]);
});

test("the model-aware work pair reaches the quality threshold", () => {
  const pair = minimumQualityWorkPair(DEFAULT_TWO_TASK_PARAMETERS.worker);
  assert.ok(pair);
  assert.ok(pair.before >= MIN_PHASE && pair.after >= MIN_PHASE);
  const quality = oneReviewOutcome(
    pair.before,
    pair.after,
    DEFAULT_TWO_TASK_PARAMETERS.worker,
  ).finalQuality;
  assert.ok(quality >= Q_MINIMUM - 1e-8);
  assert.ok(2 * pair.total < DEADLINE);
});

test("the deterministic NLP returns a feasible candidate for every order", () => {
  const result = optimizeTwoTasks();
  assert.equal(result.feasible, true);
  assert.equal(result.orderResults.length, 6);
  assert.equal(result.diagnostics.phaseOrderEnumeration, "exact");
  assert.equal(result.diagnostics.phaseOrdersEvaluated, 6);
  assert.equal(result.diagnostics.continuousSolver, "local");
  assert.equal(result.approximate, true);
  assert.equal(result.globalCertificate, false);
  assert.equal(result.diagnostics.globalCertificate, false);
  assert.equal(result.diagnostics.feasibleOrders, 6);
  for (const orderResult of result.orderResults) {
    assert.equal(orderResult.feasible, true);
    assert.equal(orderResult.globalCertificate, false);
    assert.ok(orderResult.durations.every(duration => duration >= MIN_PHASE - 1e-9));
    assert.ok(orderResult.totalWork <= DEADLINE + 1e-8);
    assert.ok(orderResult.tasks.A.finalQuality >= Q_MINIMUM - 1e-5);
    assert.ok(orderResult.tasks.B.finalQuality >= Q_MINIMUM - 1e-5);
  }
});

test("the selected default candidate satisfies the reported KKT tolerance", () => {
  const result = optimizeTwoTasks();
  assert.equal(result.best.solverStatus, "converged_kkt");
  assert.equal(result.solverStatus, result.best.solverStatus);
  assert.equal(result.statusLabel, SOLVER_STATUS_LABELS.converged_kkt);
  assert.ok(result.best.solverDiagnostics.primalResidual <= 1e-7);
  assert.ok(result.best.solverDiagnostics.stationarityResidual <= 2e-5);
  assert.ok(result.best.solverDiagnostics.complementarityResidual <= 2e-5);
  assert.ok(result.best.solverDiagnostics.kktResidual <= 2e-5);
  const multipliers = result.best.solverDiagnostics.multipliers;
  assert.ok(multipliers.qualityA >= 0);
  assert.ok(multipliers.qualityB >= 0);
  assert.ok(multipliers.deadline >= 0);
  assert.ok(multipliers.lowerBounds.every(value => value >= 0));
  const independent = kktDiagnostics(evaluateFixedOrderNlp(
    result.best.order,
    result.best.durations,
  ));
  close(independent.kktResidual, result.best.solverDiagnostics.kktResidual, 1e-12);
  assert.equal(independent.normalized.kktResidual, independent.kktResidual);
  assert.equal(independent.raw.constraintValues.length, 7);
  assert.equal(independent.normalized.constraintValues.length, 7);
});

test("the solver exactly replays the same result after an intervening call", () => {
  const first = optimizeTwoTasks();
  optimizeTwoTasks(parametersWith({ A: { beta: 7 } }));
  const replay = optimizeTwoTasks();
  assert.deepEqual(replay, first);
});

test("manager intercepts shift J without changing the selected schedule", () => {
  const initial = optimizeTwoTasks();
  const shifted = optimizeTwoTasks(parametersWith({ A: { e0: 60 }, B: { e0: 5 } }));
  assert.equal(shifted.best.orderLabel, initial.best.orderLabel);
  assert.deepEqual(shifted.best.durations, initial.best.durations);
  close(shifted.best.overallJ - initial.best.overallJ, -40);
});

test("a weak worker setting reports an honest absence of a feasible candidate", () => {
  const result = optimizeTwoTasks(parametersWith({
    worker: { qInfinity: 55, kappa: 0.1, rhoBar: 0.4, lambda: 0.1 },
  }));
  assert.equal(result.feasible, false);
  assert.equal(result.best.solverStatus, "no_feasible_candidate_found");
  assert.equal(result.diagnostics.status, "no_feasible_candidate_found");
  assert.equal(result.diagnostics.globalCertificate, false);
  assert.equal(result.diagnostics.feasibilityStart, null);
  assert.ok(result.best.violation.normalizedMaximum > 0);
});

test("a steeper expectation slope moves that task's events earlier", () => {
  const aUrgent = optimizeTwoTasks(parametersWith({ A: { beta: 15 }, B: { beta: 0 } }));
  const bUrgent = optimizeTwoTasks(parametersWith({ A: { beta: 0 }, B: { beta: 15 } }));
  assert.ok(aUrgent.best.tasks.A.tau + aUrgent.best.tasks.A.completionTime
    < aUrgent.best.tasks.B.tau + aUrgent.best.tasks.B.completionTime);
  assert.ok(bUrgent.best.tasks.B.tau + bUrgent.best.tasks.B.completionTime
    < bUrgent.best.tasks.A.tau + bUrgent.best.tasks.A.completionTime);
  assert.notEqual(aUrgent.best.orderLabel, bUrgent.best.orderLabel);
});

test("candidate comparison prefers qualified local candidates and stable ties", () => {
  const base = {
    feasible: true,
    solverStatus: "converged_kkt",
    overallJ: 1,
    totalWork: 20,
    orderIndex: 0,
    durations: [5, 5, 5, 5],
    violation: { normalizedMaximum: 0 },
    solverDiagnostics: { kktResidual: 1e-7 },
  };
  assert.ok(compareCandidates(base, {
    ...base,
    solverStatus: "feasible_iteration_limit",
    overallJ: 1e6,
  }) < 0);
  assert.ok(compareCandidates({ ...base, overallJ: 2 }, base) < 0);
  assert.ok(compareCandidates({ ...base, orderIndex: 0 }, { ...base, orderIndex: 1 }) < 0);
});

test("invalid parameters, orders, and solver options are rejected", () => {
  assert.throws(() => buildSchedule(["A1", "A2", "A1", "B2"], [1, 1, 1, 1]), RangeError);
  assert.throws(() => buildSchedule(["A2", "A1", "B1", "B2"], [1, 1, 1, 1]), RangeError);
  assert.throws(() => evaluateSchedule(PHASE_ORDERS[0], [1, 1, 1, 1],
    parametersWith({ worker: { qInfinity: 101 } })), RangeError);
  assert.throws(() => optimizeTwoTasks(DEFAULT_TWO_TASK_PARAMETERS, {
    latticeResolution: 1,
  }), RangeError);
  assert.throws(() => optimizeTwoTasks(DEFAULT_TWO_TASK_PARAMETERS, {
    startsPerOrder: 0,
  }), RangeError);
  assert.throws(() => optimizeTwoTasks(DEFAULT_TWO_TASK_PARAMETERS, {
    pairGridPoints: 32,
  }), RangeError);
  assert.throws(() => optimizeTwoTasks(DEFAULT_TWO_TASK_PARAMETERS, {
    minimumPhase: 0,
  }), RangeError);
  assert.throws(() => optimizeTwoTasks(DEFAULT_TWO_TASK_PARAMETERS, {
    initialPenalty: 0,
  }), RangeError);
  assert.throws(() => normalizeParameters(null), TypeError);
  assert.throws(() => normalizeNlpOptions(null), TypeError);
  assert.throws(() => normalizeOptimizerOptions(null), TypeError);
  assert.equal(DEFAULT_NLP_OPTIONS.minimumPhase, MIN_PHASE);
  assert.equal(DEFAULT_OPTIMIZER_OPTIONS.startsPerOrder, 8);
});
