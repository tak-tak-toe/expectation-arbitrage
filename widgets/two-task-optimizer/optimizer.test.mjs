import test from "node:test";
import assert from "node:assert/strict";
import { baselineQuality, reviewedQuality } from "../review-model/model.js";
import {
  DEADLINE,
  Q_MINIMUM,
  DEFAULT_TWO_TASK_PARAMETERS,
  PHASE_ORDERS,
  buildSchedule,
  evaluateSchedule,
  qualityAtCalendarTime,
  expectationAtCalendarTime,
} from "./model.js";
import { compareCandidates, optimizeTwoTasks } from "./optimizer.js";

function close(actual, expected, tolerance = 1e-9) {
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

test("schedule evaluation reuses the one-task quality and evaluation definitions", () => {
  const result = evaluateSchedule(
    ["A1", "B1", "A2", "B2"],
    [2, 3, 5, 7],
    DEFAULT_TWO_TASK_PARAMETERS,
  );
  close(result.tasks.A.reviewQuality, baselineQuality(2));
  close(result.tasks.A.finalQuality, reviewedQuality(2, 3));
  close(result.tasks.B.reviewQuality, baselineQuality(5));
  close(result.tasks.B.finalQuality, reviewedQuality(5, 7));
  close(result.totalEvaluation, result.tasks.A.evaluation + result.tasks.B.evaluation);
  close(result.meanEvaluation, result.totalEvaluation / 2);
});

test("calendar quality plateaus during work on the other task", () => {
  const schedule = buildSchedule(["A1", "B1", "A2", "B2"], [2, 3, 5, 7]);
  const atReview = qualityAtCalendarTime(schedule, "A", 2);
  close(qualityAtCalendarTime(schedule, "A", 4), atReview);
  close(qualityAtCalendarTime(schedule, "A", 7), atReview);
  assert.ok(qualityAtCalendarTime(schedule, "A", 8) > atReview);
  close(expectationAtCalendarTime("A", 7) - expectationAtCalendarTime("A", 2), 25);
});

test("feasible-first comparison follows objective and violation rules", () => {
  const base = {
    feasible: true,
    objectiveValue: 0,
    totalWork: 20,
    orderIndex: 0,
    durations: [5, 5, 5, 5],
    violation: { normalizedTotal: 0 },
  };
  const infeasible = {
    ...base,
    feasible: false,
    objectiveValue: 1e6,
    violation: { normalizedTotal: 0.001 },
  };
  assert.ok(compareCandidates(base, infeasible) < 0);
  assert.ok(compareCandidates({ ...base, objectiveValue: 2 }, base) < 0);
  assert.ok(compareCandidates(
    { ...infeasible, violation: { normalizedTotal: 0.0001 } },
    infeasible,
  ) < 0);
});

test("the default parameters produce a feasible approximate solution", () => {
  const result = optimizeTwoTasks();
  assert.equal(DEADLINE, 25);
  assert.equal(Q_MINIMUM, 100);
  assert.ok(DEFAULT_TWO_TASK_PARAMETERS.worker.qbar <= Q_MINIMUM);
  assert.equal(result.feasible, true);
  assert.equal(result.orderResults.length, 6);
  assert.equal(result.diagnostics.feasibleOrders, 6);
  assert.ok(PHASE_ORDERS.some(order => order.join("") === result.best.order.join("")));
  assert.ok(result.best.durations.every(duration => duration > 0));
  assert.ok(result.best.tasks.A.finalQuality >= Q_MINIMUM);
  assert.ok(result.best.tasks.B.finalQuality >= Q_MINIMUM);
  assert.ok(result.best.totalWork <= DEADLINE);
  for (const orderResult of result.orderResults) {
    assert.ok(orderResult.tasks.A.finalQuality >= Q_MINIMUM);
    assert.ok(orderResult.tasks.B.finalQuality >= Q_MINIMUM);
    assert.ok(orderResult.totalWork <= DEADLINE);
  }
});

test("the deterministic solver exactly replays the same result", () => {
  const first = optimizeTwoTasks();
  optimizeTwoTasks(parametersWith({ A: { b: 7 } }));
  const replay = optimizeTwoTasks();
  assert.deepEqual(replay, first);
});

test("floating-point boundary noise preserves feasibility", () => {
  const result = evaluateSchedule(
    PHASE_ORDERS[0],
    [5, 7.5, 5, 7.500000000000003],
    DEFAULT_TWO_TASK_PARAMETERS,
  );
  assert.ok(result.totalWork > DEADLINE);
  assert.ok(result.violation.time < 1e-9);
  assert.equal(result.feasible, true);
});

test("manager intercepts shift evaluation without changing the schedule", () => {
  const initial = optimizeTwoTasks();
  const shifted = optimizeTwoTasks(parametersWith({ A: { a: 60 }, B: { a: 5 } }));
  assert.equal(shifted.best.orderLabel, initial.best.orderLabel);
  assert.deepEqual(shifted.best.durations, initial.best.durations);
  close(shifted.best.centeredObjective, initial.best.centeredObjective);
  close(
    shifted.best.totalEvaluation - initial.best.totalEvaluation,
    -(60 - 20) - (5 - 25),
  );
});

test("a deliberately weak worker setting yields no claimed feasible solution", () => {
  const result = optimizeTwoTasks(parametersWith({
    worker: { qbar: 55, k: 0.1, h: 8 },
  }));
  assert.equal(result.feasible, false);
  assert.equal(result.diagnostics.feasibleOrders, 0);
  assert.ok(result.best.violation.normalizedTotal > 0);
});

test("a steep expectation slope brings that task earlier in a representative case", () => {
  const aUrgent = optimizeTwoTasks(parametersWith({ A: { b: 15 }, B: { b: 0 } }));
  const bUrgent = optimizeTwoTasks(parametersWith({ A: { b: 0 }, B: { b: 15 } }));
  assert.ok(aUrgent.best.tasks.A.tau + aUrgent.best.tasks.A.completionTime
    < aUrgent.best.tasks.B.tau + aUrgent.best.tasks.B.completionTime);
  assert.ok(bUrgent.best.tasks.B.tau + bUrgent.best.tasks.B.completionTime
    < bUrgent.best.tasks.A.tau + bUrgent.best.tasks.A.completionTime);
  assert.notEqual(aUrgent.best.orderLabel, bUrgent.best.orderLabel);
});

test("steep expectations can leave trailing idle while flat expectations use the horizon", () => {
  const steep = optimizeTwoTasks(parametersWith({ A: { b: 15 }, B: { b: 15 } }));
  const flat = optimizeTwoTasks(parametersWith({ A: { b: 0 }, B: { b: 0 } }));
  assert.ok(steep.best.totalWork < DEADLINE - 1);
  assert.ok(steep.best.tasks.A.finalQuality < Q_MINIMUM + 0.1);
  assert.ok(steep.best.tasks.B.finalQuality < Q_MINIMUM + 0.1);
  close(flat.best.totalWork, DEADLINE, 1e-9);
  assert.ok(flat.best.tasks.A.finalQuality > Q_MINIMUM);
  assert.ok(flat.best.tasks.B.finalQuality > Q_MINIMUM);
});

test("invalid model inputs and orders are rejected", () => {
  assert.throws(() => buildSchedule(["A1", "A2", "A1", "B2"], [1, 1, 1, 1]), RangeError);
  assert.throws(() => buildSchedule(["A2", "A1", "B1", "B2"], [1, 1, 1, 1]), RangeError);
  assert.throws(() => evaluateSchedule(PHASE_ORDERS[0], [1, 1, 1, 1],
    parametersWith({ worker: { qbar: 101 } })), RangeError);
});
