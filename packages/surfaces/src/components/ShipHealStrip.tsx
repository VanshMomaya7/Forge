import { Activity, ExternalLink, Gauge, RadioTower, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Task } from "../shared/task";
import { formatMilliseconds, formatPercent } from "../task/viewModel";

interface ShipHealStripProps {
  task?: Task | null;
  feed: string[];
}

export function ShipHealStrip({ task, feed }: ShipHealStripProps) {
  const deployUrl = task?.artifact?.deployUrl;
  const latestFeed = feed[0] ?? "loop standing by";

  return (
    <section className="glass grid gap-4 rounded-2xl p-4" aria-labelledby="ship-title">
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400"
          id="ship-title"
        >
          <RadioTower size={15} aria-hidden="true" />
          <span>Ship + heal</span>
        </div>
        {deployUrl ? (
          <a
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 no-underline transition hover:bg-emerald-500/20"
            href={deployUrl}
            target="_blank"
            rel="noreferrer"
          >
            live
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        ) : (
          <span className="text-xs font-medium text-zinc-500">no deploy yet</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric icon={<Gauge size={14} aria-hidden="true" />} label="p95" value={formatMilliseconds(task?.telemetry?.p95Ms)} />
        <Metric icon={<TriangleAlert size={14} aria-hidden="true" />} label="errors" value={formatPercent(task?.telemetry?.errorRate)} />
      </div>

      <div className="flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-300 [overflow-wrap:anywhere]">
        <Activity size={14} className="flex-none text-sky-300/80" aria-hidden="true" />
        <span>{latestFeed}</span>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <span className="text-sky-300/70">{icon}</span>
        {label}
      </span>
      <strong className="mt-2 block text-2xl font-semibold leading-none text-zinc-100 tabular-nums">
        {value}
      </strong>
    </div>
  );
}
