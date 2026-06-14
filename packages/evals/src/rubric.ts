import type { GenerateRubric, Rubric } from './contracts.js';

import {
  DEFAULT_CRITERIA,
  DEFAULT_RUBRIC_ID,
  DEFAULT_WEIGHTS,
  MAX_RUBRIC_CRITERIA,
  MIN_RUBRIC_CRITERIA
} from './constants.js';
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
  const criteria: string[] = [...DEFAULT_CRITERIA];
  const lowerIntent = intent.toLowerCase();

  if (lowerIntent.includes('deploy') || lowerIntent.includes('ship')) {
    criteria.push(`keeps ${repo} deployable`);
  }

  if (lowerIntent.includes('regression') || lowerIntent.includes('failing')) {
    criteria.push('reduces regression risk');
  }

  if (lowerIntent.includes('auth') || lowerIntent.includes('login') || lowerIntent.includes('rate')) {
    criteria.push('preserves security and abuse resistance');
  }

  return Array.from(new Set(criteria)).slice(0, MAX_RUBRIC_CRITERIA);
}

function normalizeRubric(candidate: Rubric): Rubric {
  const criteria = normalizeCriteria(candidate.criteria);
  const weights = normalizeWeights(candidate.weights, criteria.length);
  const rubric = {
    ...candidate,
    id: candidate.id.trim() || DEFAULT_RUBRIC_ID,
    criteria,
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

function normalizeCriteria(criteria: string[]): string[] {
  const normalized = Array.from(
    new Set(criteria.map((criterion) => criterion.trim()).filter(Boolean))
  ).slice(0, MAX_RUBRIC_CRITERIA);

  while (normalized.length < MIN_RUBRIC_CRITERIA) {
    normalized.push(DEFAULT_CRITERIA[normalized.length] ?? `criterion ${normalized.length + 1}`);
  }

  return normalized;
}

function normalizeWeights(weights: number[], count: number): number[] {
  const fallback = count === DEFAULT_WEIGHTS.length ? [...DEFAULT_WEIGHTS] : equalWeights(count);
  const usable = weights
    .slice(0, count)
    .map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const total = usable.reduce((sum, weight) => sum + weight, 0);

  if (usable.length !== count || total <= 0) {
    return fallback;
  }

  return usable.map((weight) => weight / total);
}

function equalWeights(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

function stableKey(value: unknown): string {
  return stableStringify(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function hashLabel(input: string): string {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(index);
  }

  return Math.abs(hash).toString(36);
}
