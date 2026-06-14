import type { Gate } from '@forge/shared/contracts';

import {
  BLOCK_OVERALL_THRESHOLD,
  REDIRECT_PLAN_ADHERENCE_THRESHOLD,
  REDIRECT_TASK_COMPLETION_THRESHOLD
} from './constants.js';

export const gate: Gate = (score) => {
  if (!score.rubricPass || score.overall < BLOCK_OVERALL_THRESHOLD) {
    return 'block';
  }

  if (
    score.planAdherence < REDIRECT_PLAN_ADHERENCE_THRESHOLD &&
    score.taskCompletion >= REDIRECT_TASK_COMPLETION_THRESHOLD
  ) {
    return 'redirect';
  }

  return 'pass';
};
