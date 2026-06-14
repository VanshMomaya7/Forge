import type { ScoreResult } from '@forge/shared/task';

import { DEFAULT_WEIGHTS } from './constants.js';

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function roundScore(value: number): number {
  return Math.round(clamp01(value) * 100) / 100;
}

export function hashToRange(input: string, min: number, max: number): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  const unit = (hash >>> 0) / 0xffffffff;
  return min + unit * (max - min);
}

export function normalizedCoreWeights(weights: number[]): [number, number, number] {
  const fallback: [number, number, number] = [...DEFAULT_WEIGHTS];
  const core: [number, number, number] = [
    positiveWeightAt(weights, 0, fallback[0]),
    positiveWeightAt(weights, 1, fallback[1]),
    positiveWeightAt(weights, 2, fallback[2])
  ];
  const total = core.reduce((sum, weight) => sum + weight, 0);

  if (total <= 0) {
    return fallback;
  }

  return core.map((weight) => weight / total) as [number, number, number];
}

function positiveWeightAt(weights: number[], index: number, fallback: number): number {
  const weight = weights[index];

  return typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : fallback;
}

export function weightedOverall(score: Omit<ScoreResult, 'overall' | 'rubricPass'>, weights: number[]): number {
  const [planWeight, toolWeight, completionWeight] = normalizedCoreWeights(weights);

  return roundScore(
    score.planAdherence * planWeight +
      score.toolCorrectness * toolWeight +
      score.taskCompletion * completionWeight
  );
}
