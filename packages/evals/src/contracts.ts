import type { ScoreResult, Step, Task, Verdict } from '@forge/shared/task';

export interface Rubric {
  id: string;
  criteria: string[];
  weights: number[];
}

export type GenerateRubric = (context: Task['context']) => Promise<Rubric>;
export type Score = (task: Task, step: Step, rubric: Rubric) => Promise<ScoreResult>;
export type Gate = (score: ScoreResult) => Verdict;
