import type { GenerateRubric, Rubric } from '@forge/shared/contracts';

import { DEFAULT_CRITERIA, DEFAULT_RUBRIC_ID, DEFAULT_WEIGHTS } from './constants.js';
import { generateRubricWithModel } from './model-judge.js';
import { RubricSchema } from './schemas.js';

const cache = new Map<string, Rubric>();

export const generateRubric: GenerateRubric = async (context) => {
  const cacheKey = stableKey(context);
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const modelRubric = await generateRubricWithModel(context);
  if (modelRubric) {
    cache.set(cacheKey, modelRubric);
    return modelRubric;
  }

  const repo = typeof context.repo === 'string' ? context.repo : 'repo';
  const intent = typeof context.intent === 'string' ? context.intent : '';
  const rubric = normalizeRubric({
    id: `${DEFAULT_RUBRIC_ID}:${hashLabel(cacheKey)}`,
    criteria: buildCriteria(repo, intent),
    weights: [...DEFAULT_WEIGHTS]
  });

  cache.set(cacheKey, rubric);
  return rubric;
};

export function clearRubricCache(): void {
  cache.clear();
}

function buildCriteria(repo: string, intent: string): string[] {
  const criteria = [...DEFAULT_CRITERIA];
  const lowerIntent = intent.toLowerCase();

  if (lowerIntent.includes('deploy') || lowerIntent.includes('ship')) {
    return [...criteria, `keeps ${repo} deployable`];
  }

  if (lowerIntent.includes('regression') || lowerIntent.includes('failing')) {
    return [...criteria, 'reduces regression risk'];
  }

  return criteria;
}

function normalizeRubric(candidate: Rubric): Rubric {
  const weightTotal = candidate.weights.reduce((sum, weight) => sum + weight, 0);
  const weights =
    candidate.criteria.length === candidate.weights.length && weightTotal > 0
      ? candidate.weights.map((weight) => weight / weightTotal)
      : [...DEFAULT_WEIGHTS];
  const rubric = {
    ...candidate,
    criteria: candidate.criteria.slice(0, weights.length),
    weights
  };
  const parsed = RubricSchema.safeParse(rubric);

  if (parsed.success) {
    return parsed.data;
  }

  return {
    id: DEFAULT_RUBRIC_ID,
    criteria: [...DEFAULT_CRITERIA],
    weights: [...DEFAULT_WEIGHTS]
  };
}

function stableKey(value: unknown): string {
  return JSON.stringify(value, Object.keys((value ?? {}) as Record<string, unknown>).sort());
}

function hashLabel(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(index);
  }

  return Math.abs(hash).toString(36);
}
