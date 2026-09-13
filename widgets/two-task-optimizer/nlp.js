import { DEADLINE, Q_MINIMUM, MIN_PHASE } from "./model.js";

const DIMENSION = 4;

export const DEFAULT_NLP_OPTIONS = Object.freeze({
  minimumPhase: MIN_PHASE,
  outerIterations: 10,
  innerIterations: 90,
  initialPenalty: 10,
  penaltyGrowth: 8,
  maximumPenalty: 1e9,
  feasibilityTolerance: 1e-7,
  stationarityTolerance: 2e-5,
  activeTolerance: 5e-5,
  innerGradientTolerance: 2e-8,
  armijo: 1e-4,
  minimumStep: 2 ** -24,
});

function finiteVector(vector, name, length = DIMENSION) {
  if (!Array.isArray(vector) || vector.length !== length
      || vector.some(value => !Number.isFinite(value))) {
    throw new RangeError(`${name} must contain ${length} finite numbers.`);
  }
}

function finitePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite, positive number.`);
  }
}

function finiteNonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, nonnegative number.`);
  }
}

/** Validate and fill every option used by the continuous local solver. */
export function normalizeNlpOptions(overrides = {}) {
  if (!overrides || typeof overrides !== "object") {
    throw new TypeError("solver options must be an object.");
  }
  const options = { ...DEFAULT_NLP_OPTIONS, ...overrides };
  if (!Number.isInteger(options.outerIterations) || options.outerIterations < 1
      || !Number.isInteger(options.innerIterations) || options.innerIterations < 1) {
    throw new RangeError("iteration limits must be positive integers.");
  }
  finitePositive(options.minimumPhase, "minimumPhase");
  if (DIMENSION * options.minimumPhase >= DEADLINE) {
    throw new RangeError("minimumPhase must leave room inside the deadline.");
  }
  finitePositive(options.initialPenalty, "initialPenalty");
  finitePositive(options.penaltyGrowth, "penaltyGrowth");
  if (options.penaltyGrowth < 1) {
    throw new RangeError("penaltyGrowth must be at least one.");
  }
  finitePositive(options.maximumPenalty, "maximumPenalty");
  if (options.maximumPenalty < options.initialPenalty) {
    throw new RangeError("maximumPenalty must be at least initialPenalty.");
  }
  finiteNonnegative(options.feasibilityTolerance, "feasibilityTolerance");
  finiteNonnegative(options.stationarityTolerance, "stationarityTolerance");
  finiteNonnegative(options.activeTolerance, "activeTolerance");
  finitePositive(options.innerGradientTolerance, "innerGradientTolerance");
  finitePositive(options.minimumStep, "minimumStep");
  if (options.minimumStep > 1) {
    throw new RangeError("minimumStep must be at most one.");
  }
  finitePositive(options.armijo, "armijo");
  if (options.armijo >= 1) {
    throw new RangeError("armijo must be less than one.");
  }
  return options;
}

function dot(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += left[index] * right[index];
  return value;
}

function normInfinity(vector) {
  return Math.max(0, ...vector.map(value => Math.abs(value)));
}

function identity(size) {
  return Array.from({ length: size }, (_, row) => (
    Array.from({ length: size }, (_, column) => (row === column ? 1 : 0))
  ));
}

function matrixVector(matrix, vector) {
  return matrix.map(row => dot(row, vector));
}

function add(left, right, rightScale = 1) {
  return left.map((value, index) => value + rightScale * right[index]);
}

/** Euclidean projection onto z_j >= epsilon and sum(z) <= T. */
export function projectDurations(
  vector,
  minimumPhase = MIN_PHASE,
  deadline = DEADLINE,
) {
  finiteVector(vector, "vector");
  if (!Number.isFinite(minimumPhase) || minimumPhase < 0) {
    throw new RangeError("minimumPhase must be finite and nonnegative.");
  }
  if (!Number.isFinite(deadline) || deadline <= DIMENSION * minimumPhase) {
    throw new RangeError("deadline must exceed the combined phase lower bounds.");
  }
  const capacity = deadline - DIMENSION * minimumPhase;
  const shifted = vector.map(value => Math.max(0, value - minimumPhase));
  const shiftedTotal = shifted.reduce((sum, value) => sum + value, 0);
  if (shiftedTotal <= capacity) return shifted.map(value => value + minimumPhase);

  const sorted = [...shifted].sort((left, right) => right - left);
  let cumulative = 0;
  let threshold = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    cumulative += sorted[index];
    const candidate = (cumulative - capacity) / (index + 1);
    if (index === sorted.length - 1 || candidate >= sorted[index + 1]) {
      threshold = candidate;
      break;
    }
  }
  return shifted.map(value => minimumPhase + Math.max(0, value - threshold));
}

function inverseBfgsUpdate(inverse, step, gradientChange) {
  const curvature = dot(step, gradientChange);
  const scale = Math.max(1, normInfinity(step) * normInfinity(gradientChange));
  if (!(curvature > 1e-11 * scale)) return identity(step.length);
  const inverseTimesY = matrixVector(inverse, gradientChange);
  const yHy = dot(gradientChange, inverseTimesY);
  const factor = (curvature + yHy) / (curvature * curvature);
  return inverse.map((row, i) => row.map((value, j) => (
    value
      + factor * step[i] * step[j]
      - (inverseTimesY[i] * step[j] + step[i] * inverseTimesY[j]) / curvature
  )));
}

function scaledQualityConstraints(point) {
  return [0, 1].map(index => ({
    value: point.constraintValues[index] / point.constraintScales[index],
    gradient: point.constraintJacobian[index].map(value => (
      value / point.constraintScales[index]
    )),
  }));
}

function augmentedPoint(evaluate, durations, multipliers, penalty, counter) {
  const raw = evaluate(durations);
  counter.evaluations += 1;
  const constraints = scaledQualityConstraints(raw);
  let value = raw.minimizationObjective / raw.objectiveScale;
  const gradient = raw.objectiveGradient.map(component => component / raw.objectiveScale);
  constraints.forEach((constraint, index) => {
    const shifted = multipliers[index] + penalty * constraint.value;
    const positive = Math.max(0, shifted);
    value += (positive * positive - multipliers[index] * multipliers[index])
      / (2 * penalty);
    for (let dimension = 0; dimension < DIMENSION; dimension += 1) {
      gradient[dimension] += positive * constraint.gradient[dimension];
    }
  });
  return { raw, value, gradient, constraints };
}

function projectedGradient(durations, gradient, options) {
  const projected = projectDurations(
    add(durations, gradient, -1),
    options.minimumPhase,
    DEADLINE,
  );
  return add(projected, durations, -1);
}

function innerBfgs(evaluate, start, multipliers, penalty, options, counter) {
  let durations = projectDurations(start, options.minimumPhase, DEADLINE);
  let point = augmentedPoint(evaluate, durations, multipliers, penalty, counter);
  let inverse = identity(DIMENSION);
  let iterations = 0;

  for (; iterations < options.innerIterations; iterations += 1) {
    const projected = projectedGradient(durations, point.gradient, options);
    if (normInfinity(projected) <= options.innerGradientTolerance) break;

    let direction = matrixVector(inverse, point.gradient).map(value => -value);
    let fullTrial = projectDurations(add(durations, direction), options.minimumPhase, DEADLINE);
    let trialDelta = add(fullTrial, durations, -1);
    if (dot(point.gradient, trialDelta) >= -1e-14) {
      direction = projected;
      fullTrial = add(durations, direction);
      trialDelta = direction;
      inverse = identity(DIMENSION);
    }
    if (normInfinity(trialDelta) <= options.minimumStep) break;

    let stepLength = 1;
    let accepted = null;
    while (stepLength >= options.minimumStep) {
      const candidateDurations = projectDurations(
        add(durations, direction, stepLength),
        options.minimumPhase,
        DEADLINE,
      );
      const delta = add(candidateDurations, durations, -1);
      const directionalChange = dot(point.gradient, delta);
      if (directionalChange < 0) {
        const candidate = augmentedPoint(
          evaluate,
          candidateDurations,
          multipliers,
          penalty,
          counter,
        );
        if (candidate.value <= point.value + options.armijo * directionalChange) {
          accepted = { candidate, candidateDurations, delta };
          break;
        }
      }
      stepLength /= 2;
    }
    if (!accepted) break;

    const gradientChange = add(accepted.candidate.gradient, point.gradient, -1);
    inverse = inverseBfgsUpdate(inverse, accepted.delta, gradientChange);
    durations = accepted.candidateDurations;
    point = accepted.candidate;
  }
  return { durations, point, iterations };
}

function solveLinearSystem(matrix, rightHandSide) {
  const size = matrix.length;
  if (size === 0) return [];
  const augmented = matrix.map((row, index) => [...row, rightHandSide[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) <= 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }
  return augmented.map(row => row[size]);
}

function multiplierEstimate(point, activeTolerance) {
  const scaledGradient = point.objectiveGradient.map(value => (
    DEADLINE * value / point.objectiveScale
  ));
  const scaledValues = point.constraintValues.map((value, index) => (
    value / point.constraintScales[index]
  ));
  const scaledJacobian = point.constraintJacobian.map((row, index) => row.map(value => (
    DEADLINE * value / point.constraintScales[index]
  )));
  const active = scaledValues
    .map((value, index) => ({ value, index }))
    .filter(item => item.value >= -activeTolerance)
    .map(item => item.index);
  let best = {
    multipliers: Array(point.constraintValues.length).fill(0),
    residualVector: scaledGradient,
    residualSquared: dot(scaledGradient, scaledGradient),
  };

  const subsetCount = 2 ** active.length;
  for (let mask = 1; mask < subsetCount; mask += 1) {
    const selected = active.filter((_, bit) => (mask & (2 ** bit)) !== 0);
    if (selected.length > DIMENSION) continue;
    const normal = selected.map(left => selected.map(right => (
      dot(scaledJacobian[left], scaledJacobian[right])
    )));
    const rhs = selected.map(index => -dot(scaledJacobian[index], scaledGradient));
    const solution = solveLinearSystem(normal, rhs);
    if (!solution || solution.some(value => value < -1e-9 || !Number.isFinite(value))) continue;
    const multipliers = Array(point.constraintValues.length).fill(0);
    selected.forEach((index, position) => {
      multipliers[index] = Math.max(0, solution[position]);
    });
    const residualVector = [...scaledGradient];
    scaledJacobian.forEach((row, index) => {
      for (let dimension = 0; dimension < DIMENSION; dimension += 1) {
        residualVector[dimension] += multipliers[index] * row[dimension];
      }
    });
    const residualSquared = dot(residualVector, residualVector);
    if (residualSquared < best.residualSquared - 1e-18) {
      best = { multipliers, residualVector, residualSquared };
    }
  }
  return { ...best, scaledValues, active };
}

/** Compute scaled primal, stationarity, dual, complementarity, and KKT residuals. */
export function kktDiagnostics(point, { activeTolerance = 5e-5 } = {}) {
  finiteNonnegative(activeTolerance, "activeTolerance");
  const estimate = multiplierEstimate(point, activeTolerance);
  const primalResidual = Math.max(0, ...estimate.scaledValues);
  const stationarityResidual = normInfinity(estimate.residualVector);
  const dualResidual = Math.max(0, ...estimate.multipliers.map(value => -value));
  const complementarityResidual = Math.max(0, ...estimate.multipliers.map(
    (value, index) => Math.abs(value * estimate.scaledValues[index]),
  ));
  const kktResidual = Math.max(
    primalResidual,
    stationarityResidual,
    dualResidual,
    complementarityResidual,
  );
  const originalMultipliers = estimate.multipliers.map((value, index) => (
    value * point.objectiveScale / point.constraintScales[index]
  ));
  const rawLagrangianGradient = [...point.objectiveGradient];
  point.constraintJacobian.forEach((row, index) => {
    for (let dimension = 0; dimension < DIMENSION; dimension += 1) {
      rawLagrangianGradient[dimension] += originalMultipliers[index] * row[dimension];
    }
  });
  const rawConstraintViolations = point.constraintValues.map(value => Math.max(0, value));
  const normalizedConstraintViolations = estimate.scaledValues.map(value => Math.max(0, value));
  const rawComplementarity = originalMultipliers.map((value, index) => (
    value * point.constraintValues[index]
  ));
  return {
    primalResidual,
    stationarityResidual,
    dualResidual,
    complementarityResidual,
    kktResidual,
    activeConstraints: estimate.active.map(index => point.constraintNames[index]),
    raw: {
      constraintValues: [...point.constraintValues],
      constraintViolations: rawConstraintViolations,
      primalResidual: Math.max(0, ...rawConstraintViolations),
      lagrangianGradient: rawLagrangianGradient,
      stationarityResidual: normInfinity(rawLagrangianGradient),
      complementarity: rawComplementarity,
      complementarityResidual: Math.max(0, ...rawComplementarity.map(Math.abs)),
    },
    normalized: {
      constraintValues: estimate.scaledValues,
      constraintViolations: normalizedConstraintViolations,
      primalResidual,
      lagrangianGradient: estimate.residualVector,
      stationarityResidual,
      dualResidual,
      complementarity: estimate.multipliers.map((value, index) => (
        value * estimate.scaledValues[index]
      )),
      complementarityResidual,
      kktResidual,
    },
    multipliers: {
      qualityA: originalMultipliers[0],
      qualityB: originalMultipliers[1],
      deadline: originalMultipliers[2],
      lowerBounds: originalMultipliers.slice(3),
      normalized: estimate.multipliers,
    },
  };
}

/** One deterministic augmented-Lagrangian/BFGS solve from a supplied start. */
export function solveLocalNlp(evaluate, start, overrides = {}) {
  if (typeof evaluate !== "function") throw new TypeError("evaluate must be a function.");
  finiteVector(start, "start");
  const options = normalizeNlpOptions(overrides);
  const counter = { evaluations: 0 };
  let durations = projectDurations(start, options.minimumPhase, DEADLINE);
  let multipliers = [0, 0];
  let penalty = options.initialPenalty;
  let previousViolation = Number.POSITIVE_INFINITY;
  let totalInnerIterations = 0;
  let outerIterations = 0;
  let point = evaluate(durations);
  counter.evaluations += 1;

  for (; outerIterations < options.outerIterations; outerIterations += 1) {
    const inner = innerBfgs(evaluate, durations, multipliers, penalty, options, counter);
    durations = inner.durations;
    point = inner.point.raw;
    totalInnerIterations += inner.iterations;
    const qualityConstraints = scaledQualityConstraints(point).map(item => item.value);
    const violation = Math.max(0, ...qualityConstraints);
    multipliers = multipliers.map((value, index) => (
      Math.max(0, value + penalty * qualityConstraints[index])
    ));
    const diagnostics = kktDiagnostics(point, options);
    if (diagnostics.primalResidual <= options.feasibilityTolerance
        && diagnostics.kktResidual <= options.stationarityTolerance) {
      outerIterations += 1;
      break;
    }
    if (violation > previousViolation * 0.35) {
      penalty = Math.min(options.maximumPenalty, penalty * options.penaltyGrowth);
    }
    previousViolation = violation;
  }

  const diagnostics = kktDiagnostics(point, options);
  const feasible = diagnostics.primalResidual <= options.feasibilityTolerance;
  const converged = feasible && diagnostics.kktResidual <= options.stationarityTolerance;
  return {
    durations,
    point,
    feasible,
    converged,
    solverStatus: converged
      ? "converged_kkt"
      : feasible
        ? "feasible_iteration_limit"
        : "no_feasible_candidate_found",
    globalCertificate: false,
    diagnostics: {
      ...diagnostics,
      outerIterations,
      innerIterations: totalInnerIterations,
      evaluations: counter.evaluations,
      finalPenalty: penalty,
    },
  };
}
