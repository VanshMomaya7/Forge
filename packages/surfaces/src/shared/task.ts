// Surfaces consumes the FROZEN shared contract from @forge/shared as the single
// source of truth. We only keep the websocket event envelope helpers locally,
// because those are a surfaces/transport concern, not part of the Task contract.
export type {
  ScoreResult,
  Step,
  Task,
  TaskOrigin,
  TaskVerdict,
  Verdict,
} from "@forge/shared/task";
export type {
  BuildStrategy,
  ComponentCandidate,
  ComponentGraph,
  ComponentSpec,
  InterfaceContract,
  OrchestrationMode,
} from "@forge/shared/component";

import type { Task } from "@forge/shared/task";

export interface TaskUpdatedEvent {
  type: "task.updated";
  task: Task;
}

export function isTaskUpdatedEvent(value: unknown): value is TaskUpdatedEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TaskUpdatedEvent>;
  return candidate.type === "task.updated" && Boolean(candidate.task);
}
