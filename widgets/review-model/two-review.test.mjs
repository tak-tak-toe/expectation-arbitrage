import test from "node:test";
import assert from "node:assert/strict";
import {
  twoReviewObjectives, optimalFinalizationTimeGivenIntermediate, optimalTwoReviewTimes,
  oneTaskObjectives, oneReviewOutcome, DEADLINE, normalizeOneTaskParameters,
} from "./model.js";
import { evaluationHeatmap, renderOverallEvaluationWidget, renderTwoReviewTimeline } from "./evaluation-widget.js";
import { chapterThreeParameters, optimalScheduleTrajectory } from "./chapter-three.js";

test("Chapter 3 fixes recovery strength and trajectories reuse shared dynamics", () => {
  const config = chapterThreeParameters({ rhoBar: 0.2, worker: { rhoBar: 0.1 } });
  assert.equal(config.rhoBar, 1);
  for (const beta of [0, 3, 100]) {
    const parameters = chapterThreeParameters({ ...config, beta });
    const optimum = optimalTwoReviewTimes(parameters);
    const trajectory = optimalScheduleTrajectory(optimum, parameters);
    const first = trajectory.before.at(-1), post = trajectory.after[0], last = trajectory.after.at(-1);
    close(first.quality, optimum.objectives.reviewQuality);
    close(post.quality, first.quality);
    close(last.quality, optimum.objectives.finalQuality);
    close(first.expectation, first.quality - optimum.objectives.intermediateScore);
    close(last.expectation, last.quality - optimum.objectives.finalScore);
    close(first.productivity, optimum.objectives.preReviewProductivity);
    close(post.productivity, optimum.objectives.postReviewProductivity);
    for (const point of [...trajectory.before, ...trajectory.after]) assert.ok(point.t <= optimum.t2 + 1e-12);
    if (optimum.conditional.status === "interior") close(last.productivity, trajectory.threshold);
    if (optimum.conditional.status === "deadline-finalization") assert.ok(last.productivity >= trajectory.threshold);
    if (beta === 100) {
      assert.equal(optimum.conditional.status, "immediate-finalization");
      assert.ok(trajectory.threshold > 1);
    }
  }
});

const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, a + " != " + b);

test("two-review objectives match the old fixed-deadline boundary", () => {
  for (const parameters of [{}, { rhoBar: 0 }, { beta: 0, lambda: 1 }, { qInfinity: 100, kappa: 0.05 }]) {
    for (const t1 of [0, 1, 8, 12.5, 24, 25]) {
      const actual = twoReviewObjectives(t1, DEADLINE, parameters);
      const legacy = oneTaskObjectives(t1, parameters);
      for (const key of ["reviewQuality", "finalQuality", "intermediateScore", "finalScore"]) {
        close(actual[key], legacy[key]);
      }
      close(actual.averageScore, legacy.totalScore / 2);
    }
  }
});

test("equal times have zero post-work, identical qualities and identical scores", () => {
  for (const t of [0, 4, 25]) {
    const value = twoReviewObjectives(t, t);
    assert.equal(value.postReviewWork, 0);
    assert.equal(value.finalQuality, value.reviewQuality);
    assert.equal(value.finalScore, value.intermediateScore);
  }
  const value = twoReviewObjectives(3, 12);
  const outcome = oneReviewOutcome(3, 9);
  assert.deepEqual(value.outcome, outcome);
  close(value.finalScore, outcome.finalQuality - 20 - 3 * 12);
  assert.equal("omega" in normalizeOneTaskParameters(), false);
  assert.equal("weightedScore" in value, false);
});

test("invalid review pairs and intermediate times are rejected", () => {
  for (const [t1, t2] of [[-1, 2], [0, -1], [5, 4], [0, 26], [NaN, 10], [1, Infinity]]) {
    assert.throws(() => twoReviewObjectives(t1, t2), RangeError);
  }
  for (const t1 of [-1, 26, NaN, Infinity]) {
    assert.throws(() => optimalFinalizationTimeGivenIntermediate(t1), RangeError);
  }
});

test("analytic finalization covers immediate, interior, deadline and beta zero", () => {
  const immediate = optimalFinalizationTimeGivenIntermediate(5, { beta: 100 });
  assert.equal(immediate.status, "immediate-finalization");
  assert.equal(immediate.t2, 5);
  for (const beta of [0, 0.0001]) {
    const value = optimalFinalizationTimeGivenIntermediate(5, { beta });
    assert.equal(value.status, "deadline-finalization");
    assert.equal(value.t2, 25);
  }
  const interior = optimalFinalizationTimeGivenIntermediate(5);
  assert.equal(interior.status, "interior");
  close(interior.marginalQualityAtFinalization, 3);
  assert.equal(interior.diagnostics.globalCertificate, true);
  const h = 1e-5;
  const derivative = (twoReviewObjectives(5, interior.t2 + h).averageScore
    - twoReviewObjectives(5, interior.t2 - h).averageScore) / (2 * h);
  close(derivative, 0, 1e-8);
  const m0 = interior.marginalQualityAtStart;
  assert.equal(optimalFinalizationTimeGivenIntermediate(5, { beta: m0 }).t2, 5);
});

test("conditional optimum dominates deterministic feasible alternatives", () => {
  for (const beta of [0, 0.1, 3, 20]) for (const t1 of [0, 5, 20, 25]) {
    const result = optimalFinalizationTimeGivenIntermediate(t1, { beta });
    assert.ok(t1 <= result.t2 && result.t2 <= 25);
    const best = twoReviewObjectives(t1, result.t2, { beta }).averageScore;
    for (let i = 0; i <= 50; i++) {
      assert.ok(best + 1e-9 >= twoReviewObjectives(t1, t1 + (25 - t1) * i / 50, { beta }).averageScore);
    }
  }
});

test("joint optimizer is feasible, deterministic, E0-invariant and locally maximal", () => {
  for (const parameters of [{}, { beta: 0 }, { beta: 20 }, { rhoBar: 0 }, { kappa: 0.05, lambda: 0.03 }]) {
    const result = optimalTwoReviewTimes(parameters);
    assert.ok(0 <= result.t1 && result.t1 <= result.t2 && result.t2 <= 25);
    assert.equal(result.diagnostics.globalCertificate, false);
    assert.deepEqual(optimalTwoReviewTimes(parameters), result);
    const shifted = optimalTwoReviewTimes({ ...parameters, e0: 60 });
    assert.equal(shifted.t1, result.t1);
    assert.equal(shifted.t2, result.t2);
    for (const key of ["intermediateScore", "finalScore", "averageScore"]) {
      close(shifted.objectives[key], result.objectives[key] - 40);
    }
    for (const dx of [-0.01, 0, 0.01]) for (const dy of [-0.01, 0, 0.01]) {
      const a = result.t1 + dx, b = result.t2 + dy;
      if (a >= 0 && a <= b && b <= 25) {
        assert.ok(result.objectives.averageScore + 1e-8 >= twoReviewObjectives(a, b, parameters).averageScore);
      }
    }
  }
});

test("display grid stays within the feasible triangle", () => {
  const cells = evaluationHeatmap({});
  assert.equal(cells.length, 1830);
  for (const cell of cells) {
    assert.ok(Number.isFinite(cell.value));
    for (const [t1, t2] of cell.vertices) assert.ok(t1 >= 0 && t1 <= t2 && t2 <= 25 + 1e-12);
  }
});

test("Chapter 3 widgets construct, update all controls, reset and dispose", () => {
  class Element {
    constructor(name) { this.name = name; this.children = []; this.attributes = {}; this.listeners = {}; this.dataset = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    getBoundingClientRect() { return { width: 360 }; }
  }
  const originalDocument = globalThis.document, originalObserver = globalThis.ResizeObserver;
  let disconnected = 0;
  globalThis.document = {
    createElement: name => new Element(name), createElementNS: (_, name) => new Element(name),
    createTextNode: textContent => ({ textContent, children: [] }),
  };
  globalThis.ResizeObserver = class { observe() {} disconnect() { disconnected++; } };
  const all = node => [node, ...node.children.flatMap(all)];
  try {
    const timeline = renderTwoReviewTimeline();
    assert.equal(timeline.className, "model-widget");
    assert.ok(timeline.children.some(n => n.name === "style"));
    assert.ok(timeline.children.find(n => n.className === "mw-plots").children.some(n => n.name === "svg"));
    assert.match(all(timeline).map(n => n.textContent || "").join(" "), /最終レビュー・最終化/);
    timeline.dispose();
    const root = renderOverallEvaluationWidget({ rhoBar: 0.2 });
    const expected = optimalTwoReviewTimes(chapterThreeParameters({ rhoBar: 0.2 }));
    const displayedAverage = () => Number(all(root).find(n => n.attributes?.["aria-label"] === "総合評価 J").textContent);
    close(displayedAverage(), expected.objectives.averageScore, 0.005);
    const inputs = all(root).filter(n => n.name === "input");
    assert.equal(inputs.length, 5);
    assert.ok(inputs.every(n => !n.id.includes("rhoBar")));
    assert.equal(all(root).filter(n => n.name === "svg").length, 3);
    assert.ok(inputs.every(n => !n.id.includes("omega")));
    for (const input of inputs) for (const value of [Number(input.min), Number(input.max)]) {
      input.valueAsNumber = value;
      input.listeners.input();
      for (const node of all(root).filter(n => n.name === "path" || n.name === "polygon")) {
        assert.doesNotMatch(node.attributes.d || node.attributes.points, /NaN|Infinity/);
      }
    }
    const texts = all(root).map(n => n.textContent || "").join(" ");
    assert.doesNotMatch(texts, /ω|重み付き|三つの最適/);
    assert.match(texts, /総合評価 J/);
    all(root).find(n => n.name === "button").listeners.click();
    close(displayedAverage(), expected.objectives.averageScore, 0.005);
    root.dispose();
    assert.equal(disconnected, 4);
  } finally {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalObserver === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = originalObserver;
  }
});
