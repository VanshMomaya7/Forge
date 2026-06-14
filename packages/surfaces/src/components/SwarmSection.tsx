import { Check, CircleAlert, GitBranch, Globe2, Play, Rocket, Trophy } from "lucide-react";
import type { Task, Verdict } from "../shared/task";
import { formatScore, getAgentRows, getIntegrationView } from "../task/viewModel";

interface SwarmSectionProps {
  task: Task;
  previewUrl?: string;
}

export function SwarmSection({ task, previewUrl }: SwarmSectionProps) {
  const rows = getAgentRows(task);
  const integration = getIntegrationView(task);

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
      aria-labelledby="swarm-title"
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-zinc-500"
          id="swarm-title"
        >
          <GitBranch size={16} aria-hidden="true" />
          <span>Agents</span>
          <span className="text-zinc-400">{rows.length || 3} worktrees</span>
        </div>
      </div>

      <div className="mt-4 grid overflow-hidden rounded-lg border border-zinc-200 bg-white" role="list">
        {rows.length ? (
          rows.map((row) => (
            <article
              className={`grid min-h-16 grid-cols-[44px_minmax(0,1fr)_64px_104px] items-center gap-2 border-b border-zinc-100 px-3 py-3 last:border-b-0 ${
                row.isWinner ? "border-l-4 border-l-emerald-500 bg-emerald-50/70" : "bg-white"
              }`}
              key={`${row.componentId ?? "agent"}:${row.agentId}`}
              role="listitem"
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-zinc-700">{row.label}</span>
                {row.componentId ? (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                    {row.componentId}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0">
                <strong className="block truncate text-sm font-semibold text-zinc-950">
                  {row.currentAction}
                </strong>
                <span className="mt-1 block truncate text-xs font-medium text-zinc-500">
                  {row.worktree ? `${row.worktree} · ` : ""}
                  {row.stepCount} step{row.stepCount === 1 ? "" : "s"}
                </span>
              </div>
              <span className={scoreClass(row.overall)}>{formatScore(row.overall)}</span>
              <span className="flex items-center justify-end gap-1.5">
                {row.isWinner ? (
                  <span className="inline-flex min-h-7 items-center gap-1 rounded-full bg-emerald-100 px-2 text-xs font-semibold lowercase text-emerald-700">
                    <Trophy size={13} aria-hidden="true" />
                    picked
                  </span>
                ) : null}
                <span className={gateClass(row.verdict)}>
                  {gateIcon(row.verdict)}
                  {gateLabel(row.verdict)}
                </span>
              </span>
            </article>
          ))
        ) : (
          <div className="grid min-h-28 place-items-center border border-dashed border-zinc-200 bg-zinc-50 text-sm font-medium text-zinc-500">
            waiting for agents
          </div>
        )}
      </div>

      {integration ? (
        <div
          className={`mt-4 grid gap-2 rounded-lg border p-3 text-sm ${
            integration.passed
              ? "border-emerald-200 bg-emerald-50/60"
              : "border-amber-200 bg-amber-50/60"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 font-semibold text-zinc-800">
              <Rocket size={15} aria-hidden="true" />
              Integration gate
            </span>
            <span
              className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold lowercase ${
                integration.passed
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {integration.passed ? <Check size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}
              {integration.passed ? "passed" : "blocked"}
              {typeof integration.overall === "number" ? ` ${integration.overall.toFixed(2)}` : ""}
            </span>
          </div>
          {previewUrl ? (
            <a
              className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-blue-700 no-underline"
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Play size={14} aria-hidden="true" />
              Play the build
            </a>
          ) : null}
          {integration.deployUrl ? (
            <a
              className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-blue-700 no-underline"
              href={integration.deployUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Globe2 size={14} aria-hidden="true" />
              {integration.deployUrl}
            </a>
          ) : integration.artifactPath ? (
            <span className="truncate text-xs font-medium text-zinc-500" title={integration.artifactPath}>
              artifact: {integration.artifactPath}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function scoreClass(score?: number): string {
  const base =
    "inline-flex min-h-7 items-center justify-center rounded-full px-2.5 text-xs font-semibold tabular-nums";
  if (typeof score !== "number") return `${base} bg-zinc-100 text-zinc-500`;
  if (score >= 0.85) return `${base} bg-emerald-100 text-emerald-700`;
  if (score >= 0.7) return `${base} bg-amber-100 text-amber-700`;
  return `${base} bg-red-100 text-red-700`;
}

function gateClass(verdict?: Verdict): string {
  const base =
    "inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold lowercase";
  if (verdict === "block") return `${base} bg-red-100 text-red-700`;
  if (verdict === "pass") return `${base} bg-emerald-100 text-emerald-700`;
  return `${base} bg-amber-100 text-amber-700`;
}

function gateIcon(verdict?: Verdict) {
  if (verdict === "block") return <CircleAlert size={14} aria-hidden="true" />;
  if (verdict === "pass") return <Check size={14} aria-hidden="true" />;
  return null;
}

function gateLabel(verdict?: Verdict): string {
  if (verdict === "block") return "blocked";
  if (verdict === "redirect") return "redirect";
  if (verdict === "pass") return "pass";
  return "pending";
}
