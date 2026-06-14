import { Activity, ExternalLink, RadioTower } from "lucide-react";
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
    <section
      className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
      aria-labelledby="ship-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-zinc-500"
          id="ship-title"
        >
          <RadioTower size={16} aria-hidden="true" />
          <span>Ship + heal</span>
        </div>
        {deployUrl ? (
          <a
            className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-blue-700 no-underline"
            href={deployUrl}
            target="_blank"
            rel="noreferrer"
          >
            live
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : (
          <span className="text-sm font-medium text-zinc-400">no deploy yet</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Metric label="p95" value={formatMilliseconds(task?.telemetry?.p95Ms)} />
        <Metric label="errors" value={formatPercent(task?.telemetry?.errorRate)} />
      </div>

      <div className="flex min-h-9 items-center gap-2 rounded-md bg-zinc-50 px-3 text-sm font-medium text-zinc-600 [overflow-wrap:anywhere]">
        <Activity size={15} aria-hidden="true" />
        <span>{latestFeed}</span>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-24 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <span className="block text-xs font-semibold uppercase text-zinc-500">{label}</span>
      <strong className="mt-2 block text-3xl font-semibold leading-none text-zinc-950 tabular-nums">
        {value}
      </strong>
    </div>
  );
}
