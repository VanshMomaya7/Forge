import type { OrchestrationMode, Task, TaskOrigin } from "../shared/task";

let taskSequence = 0;

export function createTask(
  origin: TaskOrigin,
  intent: string,
  context: Task["context"] = {},
  mode: OrchestrationMode = "compose",
): Task {
  const now = Date.now();
  taskSequence += 1;

  return {
    id: `${origin}-${now.toString(36)}-${taskSequence.toString(36)}`,
    origin,
    intent: intent.trim(),
    context,
    mode,
    steps: [],
    verdict: "running",
    createdAt: now,
    updatedAt: now,
  };
}

export function copyTask(task: Task): Task {
  return {
    ...task,
    context: { ...task.context },
    plan: task.plan ? [...task.plan] : undefined,
    steps: task.steps.map((step) => ({
      ...step,
      scores: step.scores ? { ...step.scores } : undefined,
    })),
    scores: task.scores ? { ...task.scores } : undefined,
    artifact: task.artifact ? { ...task.artifact } : undefined,
    telemetry: task.telemetry ? { ...task.telemetry } : undefined,
  };
}
