import test from "node:test";
import assert from "node:assert/strict";
import { chapterTwoWorker, chapterTwoReview, renderRecoveryReviewWidget, renderProductivityTrajectoryWidget, renderQualityReviewWidget } from "./quality-widget.js";
import { DEFAULT_WORKER, DEADLINE, oneReviewOutcome, propagateState, optimalQualityReviewTime } from "./model.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test("Chapter 2 forces rhoBar one without changing shared parameters", () => {
  const original = { ...DEFAULT_WORKER };
  const input = { rhoBar: 0.3, lambda: 0.4 };
  assert.equal(chapterTwoWorker(input).rhoBar, 1);
  assert.equal(input.rhoBar, 0.3);
  assert.deepEqual(DEFAULT_WORKER, original);
  assert.equal(DEFAULT_WORKER.rhoBar, 0.8);
  const laterChapter = oneReviewOutcome(10, 15);
  close(laterChapter.effectiveness, 0.8 * -Math.expm1(-DEFAULT_WORKER.lambda * 10));
});

test("Chapter 2 two- and three-factor decompositions match shared state dynamics", () => {
  for (const kappa of [0.05, 0.25, 0.6]) for (const lambda of [0.03, 0.25, 1]) {
    const worker = chapterTwoWorker({ kappa, lambda });
    let previousRecovery = -1;
    for (const x of [0, 0.1, 2, 10, 12.5, 20, 25]) {
      const value = chapterTwoReview(x, worker);
      const before = Math.exp(-kappa * x);
      const recovery = -Math.expm1(-lambda * x) * -Math.expm1(-kappa * x);
      close(value.preReviewProductivity, before);
      close(value.recovery, recovery);
      close(value.postReviewProductivity, before + recovery);
      close(value.qualityGain, worker.qInfinity * recovery * -Math.expm1(-kappa * (DEADLINE - x)));
      close(value.beforeReviewState.quality, value.afterReviewState.quality);
      const later = propagateState(value.afterReviewState, DEADLINE - x, worker);
      close(later.productivity, value.postReviewProductivity * Math.exp(-kappa * (DEADLINE - x)));
      assert.ok(value.recovery >= previousRecovery);
      previousRecovery = value.recovery;
    }
  }
});

test("normalized timing remains after midpoint and moves earlier with faster readiness", () => {
  for (const kappa of [0.05, 0.25, 0.6]) {
    let previous = DEADLINE;
    for (const lambda of [0.03, 0.1, 0.25, 1]) {
      const worker = chapterTwoWorker({ kappa, lambda });
      const optimum = optimalQualityReviewTime({ worker, deadline: DEADLINE });
      assert.ok(optimum.reviewTime > DEADLINE / 2);
      assert.ok(optimum.reviewTime < previous);
      previous = optimum.reviewTime;
      const partial = optimalQualityReviewTime({ worker: { ...worker, rhoBar: 0.3 }, deadline: DEADLINE });
      close(optimum.reviewTime, partial.reviewTime);
    }
  }
});

test("Chapter 2 rejects invalid review times", () => {
  for (const x of [-1, 26, NaN, Infinity]) assert.throws(() => chapterTwoReview(x), RangeError);
});

test("Chapter 2 widgets construct, update endpoint controls, reset and dispose using existing utilities", () => {
  class Element {
    constructor(name) { this.name = name; this.children = []; this.attributes = {}; this.listeners = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    getBoundingClientRect() { return { width: 360 }; }
  }
  const originalDocument = globalThis.document;
  const originalObserver = globalThis.ResizeObserver;
  let disconnected = 0;
  globalThis.document = {
    createElement: name => new Element(name),
    createElementNS: (_, name) => new Element(name),
    createTextNode: value => ({ textContent: value, children: [] }),
  };
  globalThis.ResizeObserver = class { observe() {} disconnect() { disconnected++; } };
  const all = node => [node, ...node.children.flatMap(all)];
  try {
    for (const render of [renderRecoveryReviewWidget, renderProductivityTrajectoryWidget, renderQualityReviewWidget]) {
      const root = render({ rhoBar: 0 });
      const inputs = all(root).filter(node => node.name === "input");
      assert.equal(inputs.length, 3);
      assert.ok(inputs.every(node => !node.id.includes("rhoBar")));
      for (const input of inputs) {
        for (const value of [Number(input.min), Number(input.max)]) {
          input.valueAsNumber = value;
          input.listeners.input();
          const paths = all(root).filter(node => node.name === "path");
          assert.ok(paths.length > 0);
          for (const path of paths) assert.doesNotMatch(path.attributes.d, /NaN|Infinity/);
        }
      }
      all(root).find(node => node.name === "button").listeners.click();
      root.dispose();
    }
    assert.equal(disconnected, 3);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = originalObserver;
  }
});
