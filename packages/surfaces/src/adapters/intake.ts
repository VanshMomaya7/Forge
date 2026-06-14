import type { Task } from "../shared/task";
import { createTask } from "../task/createTask";
import { forkCurrentTask, type ForkAndRun } from "./swarm";

export interface IntakeOptions {
  repo: string;
  n?: number;
  forkAndRun?: ForkAndRun;
  onTask?: (task: Task) => void;
}

export async function submitIntake(
  intent: string,
  options: IntakeOptions,
): Promise<Task> {
  const task = createTask("human", intent, { repo: options.repo });
  options.onTask?.(task);
  await forkCurrentTask(task, {
    n: options.n ?? 3,
    forkAndRun: options.forkAndRun,
  });
  return task;
}
