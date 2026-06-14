import type { ComponentCandidate, Task, Verdict } from "../shared/task";

export interface AgentRow {
  agentId: string;
  label: string;
  componentId?: string;
  worktree?: string;
  currentAction: string;
  stepCount: number;
  overall?: number;
  verdict?: Verdict;
  isWinner: boolean;
  updatedAt: number;
}

export interface IntegrationView {
  passed: boolean;
  overall?: number;
  notes?: string;
  artifactPath?: string;
  deployUrl?: string;
}

export function getOriginLabel(origin: Task["origin"]): string {
  if (origin === "human") return "you";
  if (origin === "regression") return "regression";
  return "subtask";
}

// In compose mode the agents live in task.graph.candidates (one Codex agent per
// component variant, each in its own worktree). In race/mock mode they live in
// task.steps grouped by agentId. Render whichever is present.
export function getAgentRows(task: Task): AgentRow[] {
  const candidates = task.graph?.candidates ?? [];
  if (candidates.length > 0) {
    const selected = new Set(
      (task.selected ?? []).map((candidate) => candidateKey(candidate)),
    );

    return candidates
      .map((candidate) => {
        const last = candidate.steps.at(-1);
        return {
          agentId: candidate.variantId,
          label: variantLabel(candidate.variantId),
          componentId: candidate.componentId,
          worktree: worktreeLeaf(candidate.worktree),
          currentAction: last?.action ?? (candidate.steps.length ? "working" : "queued"),
          stepCount: candidate.steps.length,
          overall: candidate.score?.overall,
          verdict: scoreVerdict(candidate) ?? last?.verdict,
          isWinner: selected.has(candidateKey(candidate)),
          updatedAt: last?.ts ?? task.updatedAt,
        } satisfies AgentRow;
      })
      .sort((left, right) =>
        `${left.componentId}/${left.label}`.localeCompare(
          `${right.componentId}/${right.label}`,
        ),
      );
  }

  return getStepAgentRows(task);
}

export function getIntegrationView(task: Task): IntegrationView | null {
  if (!task.integration && !task.artifact?.deployUrl) return null;
  return {
    passed: task.integration?.passed ?? false,
    overall: task.integration?.gate?.overall,
    notes: task.integration?.gate?.notes,
    artifactPath: task.integration?.artifactPath,
    deployUrl: task.artifact?.deployUrl,
  };
}

function getStepAgentRows(task: Task): AgentRow[] {
  const labels: Record<string, string> = { "codex-a": "A", "codex-b": "B", "codex-c": "C" };
  const promotedAgentId =
    typeof task.context.promotedAgentId === "string"
      ? task.context.promotedAgentId
      : undefined;
  const rows = new Map<string, AgentRow>();

  for (const step of task.steps) {
    const existing = rows.get(step.agentId);
    rows.set(step.agentId, {
      agentId: step.agentId,
      label: labels[step.agentId] ?? step.agentId,
      currentAction: step.action,
      stepCount: (existing?.stepCount ?? 0) + 1,
      overall: step.scores?.overall ?? existing?.overall,
      verdict: step.verdict ?? existing?.verdict,
      isWinner: promotedAgentId === step.agentId,
      updatedAt: step.ts,
    });
  }

  return [...rows.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function candidateKey(candidate: Pick<ComponentCandidate, "componentId" | "variantId">): string {
  return `${candidate.componentId}:${candidate.variantId}`;
}

function scoreVerdict(candidate: ComponentCandidate): Verdict | undefined {
  const overall = candidate.score?.overall;
  if (overall === undefined) return undefined;
  return overall >= 0.7 ? "pass" : "block";
}

function variantLabel(variantId: string): string {
  const suffix = variantId.includes(":") ? variantId.slice(variantId.indexOf(":") + 1) : variantId;
  return suffix || variantId;
}

function worktreeLeaf(worktree: string): string {
  const parts = worktree.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? worktree;
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
