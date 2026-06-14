import { Check, CircleAlert, GitBranch, Trophy } from "lucide-react";
import type { Task, Verdict } from "../shared/task";
import { formatScore, getAgentRows } from "../task/viewModel";

interface SwarmSectionProps {
  task: Task;
}

export function SwarmSection({ task }: SwarmSectionProps) {
  const rows = getAgentRows(task);

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
          <span>Swarm</span>
          <span className="text-zinc-400">{Math.max(rows.length, 3)} agents</span>
        </div>
      </div>

      <div
        className="mt-4 grid overflow-hidden rounded-lg border border-zinc-200 bg-white"
        role="list"
      >
        {rows.length ? (
          rows.map((row) => (
            <article
              className={`grid min-h-16 grid-cols-[38px_minmax(0,1fr)_64px] items-center gap-2 border-b border-zinc-100 px-3 py-3 last:border-b-0 md:grid-cols-[44px_minmax(0,1fr)_70px_100px_minmax(104px,auto)] ${
                row.isWinner ? "border-l-4 border-l-emerald-500 bg-emerald-50/70" : "bg-white"
              }`}
              key={row.agentId}
              role="listitem"
            >
              <div className="text-sm font-semibold text-zinc-600">({row.label})</div>
              <div className="min-w-0">
                <strong className="block truncate text-sm font-semibold text-zinc-950">
                  {row.currentAction}
                </strong>
                <span className="mt-1 block truncate text-xs font-medium text-zinc-500">
                  {row.agentId}
                </span>
              </div>
              <span className={scoreClass(row.overall)}>{formatScore(row.overall)}</span>
              <span className={gateClass(row.verdict)}>
                {gateIcon(row.verdict)}
                {gateLabel(row.verdict)}
              </span>
              {row.isWinner ? (
                <span className="col-start-2 inline-flex min-h-7 w-fit items-center justify-center gap-1.5 rounded-full bg-emerald-100 px-2.5 text-xs font-semibold lowercase text-emerald-700 md:col-auto">
                  <Trophy size={14} aria-hidden="true" />
                  promoted
                </span>
              ) : null}
            </article>
          ))
        ) : (
          <div className="grid min-h-28 place-items-center border border-dashed border-zinc-200 bg-zinc-50 text-sm font-medium text-zinc-500">
            waiting for agents
          </div>
        )}
      </div>
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
    "col-start-2 inline-flex min-h-7 w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold lowercase md:col-auto";
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
