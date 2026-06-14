export type TaskOrigin = "human" | "regression" | "subtask";
export type Verdict = "pass" | "block" | "redirect";
export type TaskVerdict = "running" | "won" | "lost" | "blocked" | "shipped";

export interface ScoreResult {
  rubricPass: boolean;
  planAdherence: number;
  toolCorrectness: number;
  taskCompletion: number;
  overall: number;
  notes?: string;
}

export interface Step {
  id: string;
  agentId: string;
  action: string;
  output: string;
  scores?: ScoreResult;
  verdict?: Verdict;
  ts: number;
}

export interface Task {
  id: string;
  parentId?: string;
  origin: TaskOrigin;
  intent: string;
  context: Record<string, unknown>;
  plan?: string[];
  steps: Step[];
  scores?: ScoreResult;
  verdict: TaskVerdict;
  artifact?: { diff?: string; deployUrl?: string };
  telemetry?: { p95Ms?: number; errorRate?: number };
  createdAt: number;
  updatedAt: number;
}

export interface TaskUpdatedEvent {
  type: "task.updated";
  task: Task;
}

export function isTaskUpdatedEvent(value: unknown): value is TaskUpdatedEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TaskUpdatedEvent>;
  return candidate.type === "task.updated" && Boolean(candidate.task);
}
