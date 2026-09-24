import {
  DEADLINE, DEFAULT_WORKER, DEFAULT_MANAGER, normalizeOneTaskParameters,
  phi, initialWorkerState, propagateState, expectation,
} from "./model.js";

// Chapter-local normalization; overrides and resets cannot change recovery strength.
export function chapterThreeParameters(initial = {}) {
  const { worker, manager } = normalizeOneTaskParameters({
    ...initial, rhoBar: 1, deadline: DEADLINE,
  });
  return { ...DEFAULT_WORKER, ...DEFAULT_MANAGER, ...worker, ...manager, rhoBar: 1, deadline: DEADLINE };
}

/** Plot samples reuse the shared dynamics and end exactly at finalization. */
export function optimalScheduleTrajectory(optimum, parameters) {
  const { worker, manager } = normalizeOneTaskParameters(chapterThreeParameters(parameters));
  const { t1, t2, objectives } = optimum;
  const times = (a, b) => Array.from({ length: 101 }, (_, i) => i === 100 ? b : a + (b - a) * i / 100);
  const before = times(0, t1).map(t => {
    const state = propagateState(initialWorkerState(), t, worker);
    return { t, quality: phi(t, worker), productivity: state.productivity, expectation: expectation(t, manager) };
  });
  const after = times(t1, t2).map(t => {
    const state = propagateState(objectives.outcome.afterReviewState, t - t1, worker);
    return { t, quality: state.quality, productivity: state.productivity, expectation: expectation(t, manager) };
  });
  const baseline = times(0, t2).map(t => ({
    x: t, y: propagateState(initialWorkerState(), t, worker).productivity,
  }));
  return { before, after, baseline, threshold: manager.beta / (worker.qInfinity * worker.kappa) };
}
