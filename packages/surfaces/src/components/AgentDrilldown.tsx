import { CircleX, ClipboardList, TriangleAlert } from "lucide-react";
import { formatScore } from "../task/viewModel";
import type { ForestColumn, ForestStep } from "./WorktreeForest";

interface AgentDrilldownProps {
  column: ForestColumn;
  onClose: () => void;
}

// Screen 2 from the spec: click an agent, see its plan, every step's score
// breakdown, and — if the gate bit — the plain-language reason why.
export function AgentDrilldown({ column, onClose }: AgentDrilldownProps) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="glass relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-white/10 p-5 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drilldown-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {column.componentId} · worktree {column.label}
            </p>
            <h2 id="drilldown-title" className="mt-1 text-lg font-semibold text-zinc-100">
              Agent drill-in
            </h2>
            {column.worktree ? (
              <p className="mt-1 truncate font-mono text-xs text-zinc-500" title={column.worktree}>
                {column.worktree}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 flex-none place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition hover:border-white/20 hover:text-white"
            aria-label="Close agent drill-in"
          >
            <CircleX size={17} aria-hidden="true" />
          </button>
        </div>

        {column.goal ? (
          <section className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              <ClipboardList size={13} aria-hidden="true" />
              Plan
            </p>
            <p className="mt-1.5 text-sm leading-6 text-zinc-300 [overflow-wrap:anywhere]">
              {column.goal}
            </p>
            {column.contract ? (
              <p className="mt-2 font-mono text-[11px] text-zinc-500 [overflow-wrap:anywhere]">
                contract: {JSON.stringify(column.contract)}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="mt-5 grid gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Steps · {column.steps.length}
          </p>
          {column.steps.length === 0 ? (
            <p className="text-sm text-zinc-500">No steps streamed yet.</p>
          ) : (
            column.steps.map((step) => <StepRow key={step.id} step={step} />)
          )}
        </div>
      </aside>
    </div>
  );
}

function StepRow({ step }: { step: ForestStep }) {
  const blocked = step.verdict === "block";

  return (
    <div
      className={`rounded-xl border p-3.5 ${
        blocked ? "border-red-400/40 bg-red-500/[0.06]" : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-zinc-200 [overflow-wrap:anywhere]">{step.action}</p>
        {typeof step.overall === "number" ? (
          <span
            className={`flex-none rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
              blocked ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"
            }`}
          >
            {formatScore(step.overall)}
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <ScoreBar label="plan" value={step.planAdherence} />
        <ScoreBar label="tool" value={step.toolCorrectness} />
        <ScoreBar label="done" value={step.taskCompletion} />
      </div>

      {step.notes ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-xs leading-5 text-zinc-400 [overflow-wrap:anywhere]">
          {blocked ? (
            <TriangleAlert size={13} className="mt-0.5 flex-none text-red-300" aria-hidden="true" />
          ) : null}
          <span className={blocked ? "text-red-200" : undefined}>{step.notes}</span>
        </p>
      ) : null}
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value?: number }) {
  const pct = typeof value === "number" ? Math.max(0, Math.min(1, value)) * 100 : 0;

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-blue-400/80" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-zinc-400">{formatScore(value)}</p>
    </div>
  );
}
