import type { ScoreResult, Step, Task, Verdict } from './task.js';

export interface AgentConfig { worktree: string; model?: string; maxSteps?: number; }
export type RunAgent   = (task: Task, cfg: AgentConfig) => AsyncIterable<Step>;
export type ForkAndRun = (task: Task, n: number) => Promise<Task[]>;
export type Promote    = (children: Task[]) => Task;

export interface Rubric { id: string; criteria: string[]; weights: number[]; }
export type GenerateRubric = (context: Task['context']) => Promise<Rubric>;
export type Score = (task: Task, step: Step, rubric: Rubric) => Promise<ScoreResult>;
export type Gate = (score: ScoreResult) => Verdict;
