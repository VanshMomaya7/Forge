export const DEFAULT_RUBRIC_ID = 'forge-default-rubric';
export const BLOCK_OVERALL_THRESHOLD = 0.7;
export const REDIRECT_PLAN_ADHERENCE_THRESHOLD = 0.45;
export const REDIRECT_TASK_COMPLETION_THRESHOLD = 0.75;
export const HIGH_CONFIDENCE_PASS_THRESHOLD = 0.85;
export const JUDGE_TIMEOUT_MS = 2_000;
export const MAX_NOTES_LENGTH = 280;
export const MIN_RUBRIC_CRITERIA = 3;
export const MAX_RUBRIC_CRITERIA = 5;

export const DEFAULT_CRITERIA = [
  'follows the stated plan',
  'uses correct tools',
  'actually completes the task'
] as const;

export const DEFAULT_WEIGHTS = [0.4, 0.2, 0.4] as const;
