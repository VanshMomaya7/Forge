import type { Rubric, Score } from '@forge/shared/contracts';
import type { ScoreResult } from '@forge/shared/task';

import { BLOCK_OVERALL_THRESHOLD } from './constants.js';
import { clamp01, hashToRange, roundScore, weightedOverall } from './math.js';
import { scoreWithModel } from './model-judge.js';
import { ScoreResultSchema } from './schemas.js';

const LOW_SCORE: ScoreResult = {
  rubricPass: false,
  planAdherence: 0.2,
  toolCorrectness: 0.2,
  taskCompletion: 0.2,
  overall: 0.2,
  notes: 'Evaluator fallback: unable to score safely.'
};

export const score: Score = async (task, step, rubric) => {
  try {
    const modelResult = await scoreWithModel(task, step, rubric);

    if (modelResult) {
      return modelResult;
    }

    const result = scoreHeuristically(task.intent, task.plan ?? [], step.action, step.output, rubric);
    const parsed = ScoreResultSchema.safeParse(result);

    return parsed.success ? toScoreResult(parsed.data) : LOW_SCORE;
  } catch {
    return LOW_SCORE;
  }
};

function scoreHeuristically(
  intent: string,
  plan: string[],
  action: string,
  output: string,
  rubric: Rubric
): ScoreResult {
  const text = `${intent}\n${plan.join('\n')}\n${action}\n${output}`.toLowerCase();
  const stepText = `${action}\n${output}`.toLowerCase();
  const base = hashToRange(`${action}:${output}`, 0.6, 0.97);
  const distributedRequired =
    text.includes('rate-limit') ||
    text.includes('rate limit') ||
    text.includes('distributed') ||
    text.includes('multi instance');
  const usesInMemoryCounter = stepText.includes('in-memory') || stepText.includes('memory counter');
  const usesRedis = stepText.includes('redis') || stepText.includes('sliding window');
  const editsCode =
    stepText.includes('diff') ||
    stepText.includes('patch') ||
    stepText.includes('implemented') ||
    stepText.includes('added');
  const testsMentioned =
    stepText.includes('test') || stepText.includes('verified') || stepText.includes('passing');

  let planAdherence = base;
  let toolCorrectness = base - 0.03;
  let taskCompletion = base - 0.01;
  const notes: string[] = ['Heuristic judge v1.'];

  if (distributedRequired && usesInMemoryCounter) {
    planAdherence = 0.34;
    toolCorrectness = 0.42;
    taskCompletion = 0.46;
    notes.push('Blocked: in-memory counter breaks the distributed rate-limit plan.');
  } else if (distributedRequired && usesRedis) {
    planAdherence = Math.max(planAdherence, 0.92);
    toolCorrectness = Math.max(toolCorrectness, 0.9);
    taskCompletion = Math.max(taskCompletion, 0.88);
    notes.push('Redis/sliding-window approach matches the distributed plan.');
  }

  if (editsCode) {
    taskCompletion += 0.04;
  }

  if (testsMentioned) {
    toolCorrectness += 0.03;
    taskCompletion += 0.03;
  }

  const partial = {
    planAdherence: roundScore(planAdherence),
    toolCorrectness: roundScore(toolCorrectness),
    taskCompletion: roundScore(taskCompletion)
  };
  const overall = weightedOverall(partial, rubric.weights);

  return {
    rubricPass: overall >= BLOCK_OVERALL_THRESHOLD,
    ...partial,
    overall,
    notes: notes.join(' ')
  };
}

export function fallbackScore(notes = 'Evaluator fallback: unable to score safely.'): ScoreResult {
  return {
    ...LOW_SCORE,
    notes
  };
}

export function sanitizeScore(candidate: ScoreResult): ScoreResult {
  const sanitized: ScoreResult = {
    rubricPass: Boolean(candidate.rubricPass),
    planAdherence: roundScore(clamp01(candidate.planAdherence)),
    toolCorrectness: roundScore(clamp01(candidate.toolCorrectness)),
    taskCompletion: roundScore(clamp01(candidate.taskCompletion)),
    overall: roundScore(clamp01(candidate.overall))
  };

  if (candidate.notes !== undefined) {
    sanitized.notes = candidate.notes;
  }

  const parsed = ScoreResultSchema.safeParse(sanitized);

  return parsed.success ? toScoreResult(parsed.data) : LOW_SCORE;
}

function toScoreResult(candidate: {
  rubricPass: boolean;
  planAdherence: number;
  toolCorrectness: number;
  taskCompletion: number;
  overall: number;
  notes?: string | undefined;
}): ScoreResult {
  const result: ScoreResult = {
    rubricPass: candidate.rubricPass,
    planAdherence: candidate.planAdherence,
    toolCorrectness: candidate.toolCorrectness,
    taskCompletion: candidate.taskCompletion,
    overall: candidate.overall
  };

  if (candidate.notes !== undefined) {
    result.notes = candidate.notes;
  }

  return result;
}
