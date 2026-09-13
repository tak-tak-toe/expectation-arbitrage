/** Pure manager-expectation and review-score functions. */

export const DEFAULT_MANAGER = Object.freeze({ e0: 20, beta: 3 });

function finite(value, name) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite.`);
  }
}

function finiteNonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative number.`);
  }
}

function unitInterval(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be a finite number in [0, 1].`);
  }
}

export function normalizeManagerParameters(parameters = DEFAULT_MANAGER) {
  const normalized = {
    e0: parameters.e0 ?? DEFAULT_MANAGER.e0,
    beta: parameters.beta ?? DEFAULT_MANAGER.beta,
  };
  finiteNonnegative(normalized.e0, "e0");
  finiteNonnegative(normalized.beta, "beta");
  return normalized;
}

export function expectation(time, parameters = DEFAULT_MANAGER) {
  finiteNonnegative(time, "time");
  const { e0, beta } = normalizeManagerParameters(parameters);
  return e0 + beta * time;
}

export function reviewScore(quality, time, parameters = DEFAULT_MANAGER) {
  finite(quality, "quality");
  return quality - expectation(time, parameters);
}

export function sumReviewScores(scores) {
  if (!Array.isArray(scores)) throw new TypeError("scores must be an array.");
  return scores.reduce((sum, score, index) => {
    finite(score, `scores[${index}]`);
    return sum + score;
  }, 0);
}

export function weightedTwoReviewScore(intermediateScore, finalScore, omega = 0.5) {
  finite(intermediateScore, "intermediateScore");
  finite(finalScore, "finalScore");
  unitInterval(omega, "omega");
  return (1 - omega) * intermediateScore + omega * finalScore;
}

export function twoReviewEvaluation({
  reviewQuality,
  finalQuality,
  reviewTime,
  finalTime,
  manager = DEFAULT_MANAGER,
  omega = 0.5,
}) {
  const normalizedManager = normalizeManagerParameters(manager);
  finite(reviewQuality, "reviewQuality");
  finite(finalQuality, "finalQuality");
  finiteNonnegative(reviewTime, "reviewTime");
  finiteNonnegative(finalTime, "finalTime");
  if (reviewTime > finalTime) {
    throw new RangeError("reviewTime must be at most finalTime.");
  }
  const intermediateScore = reviewScore(reviewQuality, reviewTime, normalizedManager);
  const finalScore = reviewScore(finalQuality, finalTime, normalizedManager);
  return {
    intermediateScore,
    finalScore,
    totalScore: sumReviewScores([intermediateScore, finalScore]),
    weightedScore: weightedTwoReviewScore(intermediateScore, finalScore, omega),
  };
}
