import type { ScoreResult, Task } from '@forge/shared/task';

import { roundScore } from './math.js';
import { fallbackScore, sanitizeScore } from './score.js';

export function aggregateScore(task: Task): Task {
  const scores = task.steps
    .map((step) => step.scores)
    .filter((score): score is ScoreResult => score !== undefined);

  if (scores.length === 0) {
    task.scores = fallbackScore('No step scores were available to aggregate.');
    task.updatedAt = Date.now();
    return task;
  }

  if (scores.length === 1) {
    task.scores = sanitizeScore(scores[0]!);
    task.updatedAt = Date.now();
    return task;
  }

  const aggregate: ScoreResult = sanitizeScore({
    rubricPass: scores.every((score) => score.rubricPass),
    planAdherence: average(scores.map((score) => score.planAdherence)),
    toolCorrectness: average(scores.map((score) => score.toolCorrectness)),
    taskCompletion: average(scores.map((score) => score.taskCompletion)),
    overall: average(scores.map((score) => score.overall)),
    notes: `Aggregated ${scores.length} step score${scores.length === 1 ? '' : 's'}.`
  });

  task.scores = aggregate;
  task.updatedAt = Date.now();
  return task;
}

function average(values: number[]): number {
  return roundScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}
