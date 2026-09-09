import { reviewedQuality } from "../review-model/model.js";
import {
  DEADLINE,
  Q_MINIMUM,
  DEFAULT_TWO_TASK_PARAMETERS,
  PHASE_ORDERS,
  evaluateSchedule,
} from "./model.js";

const DEFAULT_OPTIONS = Object.freeze({
  populationSize: 48,
  generations: 80,
  differentialWeight: 0.72,
  crossoverRate: 0.9,
  polishStarts: 3,
  polishInitialStep: 2,
  polishMinimumStep: 0.002,
  polishSweeps: 5,
  seed: 0x5eed2a5,
});

export const MIN_PHASE = 1e-4;

function stableOrderHash(order) {
  let hash = 2166136261;
  for (const character of order.join("")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function repair(vector) {
  const repaired = vector.map(value => {
    if (!Number.isFinite(value)) return MIN_PHASE;
    return Math.max(MIN_PHASE, value);
  });
  let total = repaired.reduce((sum, value) => sum + value, 0);
  if (total > DEADLINE) {
    const movable = repaired.map(value => value - MIN_PHASE);
    const movableTotal = movable.reduce((sum, value) => sum + value, 0);
    const scale = (DEADLINE - repaired.length * MIN_PHASE) / movableTotal;
    for (let index = 0; index < repaired.length; index += 1) {
      repaired[index] = MIN_PHASE + movable[index] * scale;
    }
    total = repaired.reduce((sum, value) => sum + value, 0);
    if (total > DEADLINE) {
      const largest = repaired.indexOf(Math.max(...repaired));
      repaired[largest] -= total - DEADLINE;
    }
  }
  return repaired;
}

function lexicographicDurations(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/** Sort comparator: a negative result means left is the preferred candidate. */
export function compareCandidates(left, right) {
  if (left.feasible !== right.feasible) return left.feasible ? -1 : 1;
  if (left.feasible) {
    if (left.objectiveValue !== right.objectiveValue) {
      return right.objectiveValue - left.objectiveValue;
    }
  } else {
    const leftViolation = left.violation.normalizedTotal;
    const rightViolation = right.violation.normalizedTotal;
    if (leftViolation !== rightViolation) return leftViolation - rightViolation;
    if (left.objectiveValue !== right.objectiveValue) {
      return right.objectiveValue - left.objectiveValue;
    }
  }
  if (left.totalWork !== right.totalWork) return left.totalWork - right.totalWork;
  if ((left.orderIndex ?? 0) !== (right.orderIndex ?? 0)) {
    return (left.orderIndex ?? 0) - (right.orderIndex ?? 0);
  }
  return lexicographicDurations(left.durations, right.durations);
}

function requiredAfterWork(before, worker) {
  const maximumAfter = DEADLINE - before;
  if (maximumAfter < MIN_PHASE) return Number.POSITIVE_INFINITY;
  if (reviewedQuality(before, MIN_PHASE, worker) >= Q_MINIMUM) return MIN_PHASE;
  if (reviewedQuality(before, maximumAfter, worker) < Q_MINIMUM) {
    return Number.POSITIVE_INFINITY;
  }
  let low = MIN_PHASE;
  let high = maximumAfter;
  for (let iteration = 0; iteration < 52; iteration += 1) {
    const middle = (low + high) / 2;
    if (reviewedQuality(before, middle, worker) >= Q_MINIMUM) high = middle;
    else low = middle;
  }
  return high;
}

function minimumQualityWorkPair(worker) {
  const gridPoints = 320;
  let best = null;
  const upper = DEADLINE - MIN_PHASE;
  const spacing = (upper - MIN_PHASE) / (gridPoints - 1);
  const consider = before => {
    if (before < MIN_PHASE || before > upper) return false;
    const after = requiredAfterWork(before, worker);
    if (!Number.isFinite(after)) return false;
    const candidate = { before, after, total: before + after };
    if (!best || candidate.total < best.total) {
      best = candidate;
      return true;
    }
    return false;
  };
  for (let index = 0; index < gridPoints; index += 1) {
    consider(MIN_PHASE + spacing * index);
  }
  if (!best) return null;

  let step = spacing;
  while (step >= 1e-6) {
    const center = best.before;
    const improvedLeft = consider(center - step);
    const improvedRight = consider(center + step);
    if (!improvedLeft && !improvedRight) step /= 2;
  }
  return best;
}

function simplexSample(random, includeIdle) {
  const componentCount = includeIdle ? 5 : 4;
  const weights = [];
  for (let index = 0; index < componentCount; index += 1) {
    weights.push(-Math.log(Math.max(Number.EPSILON, random())));
  }
  const total = weights.reduce((sum, value) => sum + value, 0);
  const available = DEADLINE - 4 * MIN_PHASE;
  return weights.slice(0, 4).map(weight => MIN_PHASE + available * weight / total);
}

function seedVectors(random, populationSize, feasiblePair) {
  const vectors = [
    [DEADLINE / 4, DEADLINE / 4, DEADLINE / 4, DEADLINE / 4],
    [4, 4, 4, 4],
    [6, 4, 6, 4],
    [4, 6, 4, 6],
  ];
  if (feasiblePair && 2 * feasiblePair.total <= DEADLINE) {
    vectors.unshift([
      feasiblePair.before,
      feasiblePair.after,
      feasiblePair.before,
      feasiblePair.after,
    ]);
  }
  let sampleIndex = 0;
  while (vectors.length < populationSize) {
    vectors.push(simplexSample(random, sampleIndex % 3 === 0));
    sampleIndex += 1;
  }
  return vectors.slice(0, populationSize).map(repair);
}

function distinctPopulationIndices(random, populationSize, excluded, count) {
  const indices = [];
  while (indices.length < count) {
    const index = Math.floor(random() * populationSize);
    if (index !== excluded && !indices.includes(index)) indices.push(index);
  }
  return indices;
}

function candidateEvaluator(order, orderIndex, parameters, objective, counter) {
  return vector => {
    counter.count += 1;
    return {
      ...evaluateSchedule(order, repair(vector), parameters, { objective }),
      orderIndex,
    };
  };
}

function neighborVectors(vector, step) {
  const neighbors = [];
  for (let index = 0; index < vector.length; index += 1) {
    for (const direction of [-1, 1]) {
      const candidate = [...vector];
      candidate[index] += direction * step;
      neighbors.push(candidate);
    }
  }
  for (let from = 0; from < vector.length; from += 1) {
    for (let to = 0; to < vector.length; to += 1) {
      if (from === to) continue;
      const candidate = [...vector];
      candidate[from] -= step;
      candidate[to] += step;
      neighbors.push(candidate);
    }
  }
  neighbors.push(vector.map(value => value * (1 - step / DEADLINE)));
  neighbors.push(vector.map(value => value * (1 + step / DEADLINE)));
  return neighbors;
}

function polish(start, evaluate, options) {
  let current = start;
  let step = options.polishInitialStep;
  while (step >= options.polishMinimumStep) {
    let sweep = 0;
    let improved = true;
    while (improved && sweep < options.polishSweeps) {
      improved = false;
      let bestNeighbor = current;
      for (const vector of neighborVectors(current.durations, step)) {
        const candidate = evaluate(vector);
        if (compareCandidates(candidate, bestNeighbor) < 0) bestNeighbor = candidate;
      }
      if (compareCandidates(bestNeighbor, current) < 0) {
        current = bestNeighbor;
        improved = true;
      }
      sweep += 1;
    }
    step /= 2;
  }
  return current;
}

function optimizeOrder(order, orderIndex, parameters, objective, options, feasiblePair) {
  const random = mulberry32((options.seed ^ stableOrderHash(order)) >>> 0);
  const counter = { count: 0 };
  const evaluate = candidateEvaluator(order, orderIndex, parameters, objective, counter);
  let population = seedVectors(random, options.populationSize, feasiblePair).map(evaluate);

  for (let generation = 0; generation < options.generations; generation += 1) {
    const next = [];
    for (let targetIndex = 0; targetIndex < population.length; targetIndex += 1) {
      const [first, second, third] = distinctPopulationIndices(
        random,
        population.length,
        targetIndex,
        3,
      );
      const mutant = population[first].durations.map((value, dimension) => (
        value + options.differentialWeight
          * (population[second].durations[dimension] - population[third].durations[dimension])
      ));
      const forcedDimension = Math.floor(random() * 4);
      const trial = population[targetIndex].durations.map((value, dimension) => (
        dimension === forcedDimension || random() < options.crossoverRate
          ? mutant[dimension]
          : value
      ));
      const evaluatedTrial = evaluate(trial);
      next.push(compareCandidates(evaluatedTrial, population[targetIndex]) < 0
        ? evaluatedTrial
        : population[targetIndex]);
    }
    population = next;
  }

  population.sort(compareCandidates);
  let best = population[0];
  const seen = new Set();
  let polished = 0;
  for (const candidate of population) {
    const key = candidate.durations.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const result = polish(candidate, evaluate, options);
    if (compareCandidates(result, best) < 0) best = result;
    polished += 1;
    if (polished >= options.polishStarts) break;
  }
  return {
    ...best,
    searchDiagnostics: {
      evaluations: counter.count,
      populationSize: options.populationSize,
      generations: options.generations,
      polishedStarts: polished,
    },
  };
}

/** Deterministically approximate the best feasible schedule across all six orders. */
export function optimizeTwoTasks(
  parameters = DEFAULT_TWO_TASK_PARAMETERS,
  { objective, ...overrides } = {},
) {
  const options = { ...DEFAULT_OPTIONS, ...overrides };
  if (options.populationSize < 4) {
    throw new RangeError("populationSize must be at least four.");
  }
  const feasiblePair = minimumQualityWorkPair(parameters.worker);
  const orderResults = PHASE_ORDERS.map((order, orderIndex) => optimizeOrder(
    order,
    orderIndex,
    parameters,
    objective,
    options,
    feasiblePair,
  ));
  const best = [...orderResults].sort(compareCandidates)[0];
  const totalEvaluations = orderResults.reduce(
    (sum, result) => sum + result.searchDiagnostics.evaluations,
    0,
  );
  return {
    feasible: best.feasible,
    best,
    orderResults,
    diagnostics: {
      approximate: true,
      algorithm: "seeded differential evolution with deterministic pattern polishing",
      seed: options.seed,
      minimumPhase: MIN_PHASE,
      populationSize: options.populationSize,
      generations: options.generations,
      totalEvaluations,
      feasibleOrders: orderResults.filter(result => result.feasible).length,
      feasibilitySeed: feasiblePair,
    },
  };
}
