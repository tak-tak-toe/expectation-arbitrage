/** Pure functions shared by the interactive figures and their tests. */
export const MINIMUM_QUALITY = 100;
export const DEFAULT_WORKER = Object.freeze({ qbar: 80, k: 0.25, h: 4 });

function nonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative number.`);
  }
}

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite, positive number.`);
  }
}

export function baselineQuality(work, { qbar, k } = DEFAULT_WORKER) {
  nonnegative(work, "work");
  positive(qbar, "qbar");
  positive(k, "k");
  return qbar * -Math.expm1(-k * work);
}

export function resetAmount(work, { h } = DEFAULT_WORKER) {
  nonnegative(work, "work");
  positive(h, "h");
  return work * -Math.expm1(-work / h);
}

export function effectiveAge(work, { h } = DEFAULT_WORKER) {
  nonnegative(work, "work");
  positive(h, "h");
  return work * Math.exp(-work / h);
}

export function reviewedQuality(before, after, parameters = DEFAULT_WORKER) {
  nonnegative(after, "after");
  const initial = baselineQuality(before, parameters);
  const age = effectiveAge(before, parameters);
  // Equivalent to q0(before) + q0(age + after) - q0(age),
  // without cancellation for very small increments. Quality is not capped at 100.
  return initial + parameters.qbar * Math.exp(-parameters.k * age)
    * -Math.expm1(-parameters.k * after);
}

export function qualityAtWork(work, reviewWork, parameters = DEFAULT_WORKER) {
  nonnegative(work, "work");
  nonnegative(reviewWork, "reviewWork");
  return work <= reviewWork
    ? baselineQuality(work, parameters)
    : reviewedQuality(reviewWork, work - reviewWork, parameters);
}

export function baselineMarginalQuality(work, parameters = DEFAULT_WORKER) {
  baselineQuality(work, parameters);
  return parameters.qbar * parameters.k * Math.exp(-parameters.k * work);
}

export function reviewedMarginalQuality(before, after, parameters = DEFAULT_WORKER) {
  reviewedQuality(before, after, parameters);
  return parameters.qbar * parameters.k
    * Math.exp(-parameters.k * (effectiveAge(before, parameters) + after));
}

export function managerExpectation(time, { a, b }) {
  nonnegative(time, "time");
  nonnegative(a, "a");
  nonnegative(b, "b");
  return a + b * time;
}

export function reviewEvaluation({ reviewQuality, finalQuality, reviewTime, completionTime, a, b }) {
  nonnegative(reviewQuality, "reviewQuality");
  nonnegative(finalQuality, "finalQuality");
  return (reviewQuality - managerExpectation(reviewTime, { a, b })
    + finalQuality - managerExpectation(completionTime, { a, b })) / 2;
}

/** Calculate the three evaluation axes and their supporting values for one task. */
export function evaluationAxes({
  qbar,
  k,
  h,
  totalWork,
  reviewWork,
  a,
  b,
  deadline,
  reviewTime,
  completionTime,
}) {
  positive(totalWork, "totalWork");
  positive(reviewWork, "reviewWork");
  positive(deadline, "deadline");
  positive(reviewTime, "reviewTime");
  positive(completionTime, "completionTime");
  if (reviewWork >= totalWork) {
    throw new RangeError("reviewWork must be smaller than totalWork.");
  }
  if (reviewTime >= completionTime) {
    throw new RangeError("reviewTime must be smaller than completionTime.");
  }
  if (completionTime > deadline) {
    throw new RangeError("completionTime must be at most deadline.");
  }

  const worker = { qbar, k, h };
  const manager = { a, b };
  const postReviewWork = totalWork - reviewWork;
  const reviewQuality = baselineQuality(reviewWork, worker);
  const finalQuality = reviewedQuality(reviewWork, postReviewWork, worker);
  const reviewExpectation = managerExpectation(reviewTime, manager);
  const completionExpectation = managerExpectation(completionTime, manager);
  const reviewScore = reviewQuality - reviewExpectation;
  const completionScore = finalQuality - completionExpectation;
  const evaluation = reviewEvaluation({
    reviewQuality,
    finalQuality,
    reviewTime,
    completionTime,
    a,
    b,
  });
  const preSlack = reviewTime - reviewWork;
  const postSlack = completionTime - reviewTime - postReviewWork;
  const deadlineSlack = deadline - completionTime;

  return {
    reviewQuality,
    finalQuality,
    totalWork,
    postReviewWork,
    reviewExpectation,
    completionExpectation,
    reviewScore,
    completionScore,
    evaluation,
    qualityMargin: finalQuality - MINIMUM_QUALITY,
    preSlack,
    postSlack,
    deadlineSlack,
    scheduleFeasible: preSlack >= 0 && postSlack >= 0 && deadlineSlack >= 0,
    meetsQualityStandard: finalQuality >= MINIMUM_QUALITY,
  };
}
