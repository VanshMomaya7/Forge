import type { Step, Task } from './task.js';

export interface AgentConfig { worktree: string; model?: string; maxSteps?: number; }
export type RunAgent   = (task: Task, cfg: AgentConfig) => AsyncIterable<Step>;
export type ForkAndRun = (task: Task, n: number) => Promise<Task[]>;
export type Promote    = (children: Task[]) => Task;
