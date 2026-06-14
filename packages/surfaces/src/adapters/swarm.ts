import type { Task } from "../shared/task";

export type ForkAndRun = (task: Task, n: number) => Promise<Task[]>;

export async function loadCoreForkAndRun(): Promise<ForkAndRun | undefined> {
  try {
    const moduleName = "@forge/core";
    const core = (await import(/* @vite-ignore */ moduleName)) as {
      forkAndRun?: ForkAndRun;
    };
    return core.forkAndRun;
  } catch {
    return undefined;
  }
}

export async function forkCurrentTask(
  task: Task,
  options: { n?: number; forkAndRun?: ForkAndRun } = {},
): Promise<Task[]> {
  const forkAndRun = options.forkAndRun ?? (await loadCoreForkAndRun());
  if (!forkAndRun) return [];
  return forkAndRun(task, options.n ?? 3);
}
