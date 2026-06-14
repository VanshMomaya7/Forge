import type { Task, Verdict } from "../shared/task";

export interface AgentRow {
  agentId: string;
  label: string;
  currentAction: string;
  overall?: number;
  verdict?: Verdict;
  isWinner: boolean;
  updatedAt: number;
}

const labels: Record<string, string> = {
  "codex-a": "A",
  "codex-b": "B",
  "codex-c": "C",
};

export function getOriginLabel(origin: Task["origin"]): string {
  if (origin === "human") return "you";
  if (origin === "regression") return "regression";
  return "subtask";
}

export function getAgentRows(task: Task): AgentRow[] {
  const promotedAgentId =
    typeof task.context.promotedAgentId === "string"
      ? task.context.promotedAgentId
      : undefined;
  const rows = new Map<string, AgentRow>();

  for (const step of task.steps) {
    rows.set(step.agentId, {
      agentId: step.agentId,
      label: labels[step.agentId] ?? step.agentId,
      currentAction: step.action,
      overall: step.scores?.overall,
      verdict: step.verdict,
      isWinner: promotedAgentId === step.agentId,
      updatedAt: step.ts,
    });
  }

  return [...rows.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function formatScore(value?: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(2);
}

export function formatPercent(value?: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMilliseconds(value?: number): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return `${Math.round(value)}ms`;
}
