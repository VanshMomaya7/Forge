import {
  CircleDashed,
  CircleDot,
  Crown,
  GitBranch,
  GitMerge,
  Globe2,
  Loader2,
  Play,
  Rocket,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { ComponentCandidate, Task, Verdict } from "../shared/task";
import { formatScore, getIntegrationView } from "../task/viewModel";

interface WorktreeForestProps {
  task: Task;
  previewUrl?: string;
}

type ColumnStatus = "spawning" | "working" | "done" | "winner" | "blocked";

interface ForestStep {
  id: string;
  action: string;
  ts: number;
  verdict?: Verdict;
  overall?: number;
}

interface ForestColumn {
  key: string;
  label: string;
  componentId: string;
  worktree?: string;
  steps: ForestStep[];
  overall?: number;
  verdict?: Verdict;
  isWinner: boolean;
  status: ColumnStatus;
  currentAction: string;
}

const ACCENT = "#3b82f6";
const EMERALD = "#34d399";
const AGENT_GLYPHS = ["A", "B", "C", "D", "E", "F"];
const MAX_VISIBLE_STEPS = 7;

export function WorktreeForest({ task, previewUrl }: WorktreeForestProps) {
  const columns = deriveColumns(task);
  const integration = getIntegrationView(task);
  const winnerIndices = columns.flatMap((column, index) => (column.isWinner ? [index] : []));
  const anyWorking = columns.some(
    (column) => column.status === "working" || column.status === "spawning",
  );
  const selecting = winnerIndices.length === 0 && columns.some((column) => column.steps.length > 0);
  const deployUrl = integration?.deployUrl;
  const gatePassed = integration?.passed ?? false;
  const blocked = Boolean(integration) && integration?.passed === false;

  const winnerLabel = winnerIndices.length
    ? winnerIndices
        .map((index) => columns[index]?.label)
        .filter(Boolean)
        .join(" + ")
    : undefined;

  return (
    <section
      aria-labelledby="forest-title"
      className="glass relative overflow-hidden rounded-2xl p-5 sm:p-7"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300">
            <GitBranch size={18} aria-hidden="true" />
          </span>
          <div>
            <h2
              id="forest-title"
              className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-300"
            >
              Worktree forest
            </h2>
            <p className="text-xs text-zinc-500">
              {columns.length} isolated git worktrees · agents building in parallel
            </p>
          </div>
        </div>
        <PipelineStatus
          working={anyWorking}
          selecting={selecting}
          gatePassed={gatePassed}
          deployed={Boolean(deployUrl)}
        />
      </header>

      {/* three trees, side by side */}
      <div
        className="mt-6 grid gap-4 sm:gap-5"
        style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` }}
      >
        {columns.map((column, index) => (
          <TreeColumn key={column.key} column={column} index={index} />
        ))}
      </div>

      {/* converging streams */}
      <MergeStreams columns={columns} winnerIndices={winnerIndices} deployed={Boolean(deployUrl)} />

      {/* mixture-of-agents node */}
      <MergeNode selecting={selecting} winnerLabel={winnerLabel} blocked={blocked} />

      {/* short connector down to the deploy result */}
      <div className="mx-auto h-7 w-px bg-white/15" />

      {/* deploy result */}
      <DeployNode
        gatePassed={gatePassed}
        overall={integration?.overall}
        winnerLabel={winnerLabel}
        previewUrl={previewUrl}
        deployUrl={deployUrl}
        artifactPath={integration?.artifactPath}
        selecting={selecting}
        hasRun={columns.some((column) => column.steps.length > 0)}
      />
    </section>
  );
}

function TreeColumn({ column, index }: { column: ForestColumn; index: number }) {
  const glyph = AGENT_GLYPHS[index] ?? String(index + 1);
  const visible = column.steps.slice(-MAX_VISIBLE_STEPS);
  const hidden = column.steps.length - visible.length;
  const accent = statusAccent(column.status);

  return (
    <article
      className={`group glass glass-hover relative isolate flex flex-col overflow-hidden rounded-xl p-4 sm:p-5 ${
        column.isWinner ? "ring-1 ring-emerald-400/50" : ""
      }`}
      style={{ animation: "forgeRise .5s ease-out both", animationDelay: `${index * 80}ms` }}
    >
      {/* hover sheen — indigo→cyan, painted behind the content */}
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-[radial-gradient(130%_90%_at_50%_-20%,rgba(99,102,241,0.18),rgba(56,189,248,0.06)_45%,transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      {column.isWinner ? (
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-[radial-gradient(130%_90%_at_50%_-10%,rgba(52,211,153,0.16),transparent_62%)]" />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-10 place-items-center rounded-lg border text-base font-semibold ${accent.avatar}`}
          >
            {glyph}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Worktree {glyph}
            </p>
            <p className="truncate font-mono text-xs text-zinc-300" title={column.worktree}>
              {column.worktree ?? "spawning…"}
            </p>
          </div>
        </div>
        <ScoreRing value={column.overall} status={column.status} />
      </div>

      <div
        className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${accent.badge}`}
      >
        {statusIcon(column.status)}
        {statusLabel(column.status)}
      </div>

      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm font-medium text-zinc-200 [overflow-wrap:anywhere]">
        {column.currentAction}
      </p>

      {/* the growing trunk */}
      <div className="relative mt-3 flex-1">
        <span
          className={`absolute bottom-1 left-[10px] top-1 w-px ${trunkClass(column.status)}`}
          aria-hidden="true"
        />
        <ol className="relative grid gap-2.5">
          {hidden > 0 ? (
            <li className="grid grid-cols-[22px_1fr] items-center text-[11px] text-zinc-500">
              <span className="grid place-items-center">
                <span className="size-1.5 rounded-full bg-zinc-600" />
              </span>
              <span>+{hidden} earlier step{hidden === 1 ? "" : "s"}</span>
            </li>
          ) : null}
          {visible.length === 0 ? (
            <li className="grid grid-cols-[22px_1fr] items-start gap-1">
              <span className="grid place-items-center pt-0.5">
                <span
                  className="size-2.5 rounded-full bg-zinc-600"
                  style={{ animation: "forgeBlink 1.4s ease-in-out infinite" }}
                />
              </span>
              <span className="text-xs text-zinc-500">queued — waiting for first action…</span>
            </li>
          ) : (
            visible.map((step, stepIndex) => {
              const isLast = stepIndex === visible.length - 1;
              const live = isLast && (column.status === "working" || column.status === "spawning");
              return (
                <li
                  key={step.id}
                  className="grid grid-cols-[22px_1fr] items-start gap-1"
                  style={{ animation: "forgeGrow .4s ease-out both", animationDelay: `${stepIndex * 40}ms` }}
                >
                  <span className="grid place-items-center pt-0.5">
                    <span
                      className={`size-2.5 rounded-full ${nodeDotClass(step.verdict, column.isWinner, live)}`}
                      style={live ? { animation: "forgeBlink 1.4s ease-in-out infinite" } : undefined}
                    />
                  </span>
                  <span className="min-w-0 text-xs text-zinc-300 [overflow-wrap:anywhere]">
                    {step.action}
                  </span>
                </li>
              );
            })
          )}
        </ol>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] text-zinc-500">
        <span className="font-mono">{column.componentId}</span>
        <span>
          {column.steps.length} step{column.steps.length === 1 ? "" : "s"}
        </span>
      </div>
    </article>
  );
}

function ScoreRing({ value, status }: { value?: number; status: ColumnStatus }) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const pct = typeof value === "number" ? Math.max(0, Math.min(1, value)) : 0;
  const offset = circumference * (1 - pct);
  const stroke =
    status === "winner"
      ? EMERALD
      : status === "blocked"
        ? "#f87171"
        : pct >= 0.85
          ? EMERALD
          : pct >= 0.7
            ? "#fbbf24"
            : pct > 0
              ? ACCENT
              : "#52525b";

  return (
    <div className="relative grid size-12 flex-none place-items-center">
      <svg className="size-12 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="3.5" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset .6s ease, stroke .3s ease" }}
        />
      </svg>
      <span className="absolute text-[11px] font-semibold tabular-nums text-zinc-200">
        {formatScore(value)}
      </span>
    </div>
  );
}

function MergeStreams({
  columns,
  winnerIndices,
  deployed,
}: {
  columns: ForestColumn[];
  winnerIndices: number[];
  deployed: boolean;
}) {
  const n = Math.max(columns.length, 1);
  const sources = columns.map((_, index) => ((index + 0.5) / n) * 1200);
  const mergeX = 600;
  const mergeY = 128;
  const decided = winnerIndices.length > 0;
  const winners = new Set(winnerIndices);
  const anyActive = columns.some(
    (c) => c.status === "working" || c.status === "spawning" || c.steps.length > 0,
  );

  return (
    <div className="relative -mb-2 mt-2">
      <svg className="h-[140px] w-full" viewBox="0 0 1200 140" preserveAspectRatio="none" aria-hidden="true">
        {sources.map((sx, index) => {
          const path = `M ${sx} 6 C ${sx} 74, ${mergeX} 60, ${mergeX} ${mergeY}`;
          const isWinner = winners.has(index);
          const dim = decided && !isWinner;
          const stroke = isWinner ? EMERALD : ACCENT;
          const flowing = isWinner || (!decided && anyActive);
          return (
            <path
              key={index}
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth={isWinner ? 2.6 : 1.6}
              strokeLinecap="round"
              opacity={dim ? 0.16 : isWinner ? 1 : 0.5}
              className={flowing ? "flow-path" : ""}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* trunk down to the deploy result */}
        <path
          d={`M ${mergeX} ${mergeY} L ${mergeX} 140`}
          fill="none"
          stroke={deployed ? EMERALD : ACCENT}
          strokeWidth={2.4}
          strokeLinecap="round"
          opacity={deployed || decided ? 1 : 0.5}
          className={deployed || decided ? "flow-path" : ""}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function MergeNode({
  selecting,
  winnerLabel,
  blocked,
}: {
  selecting: boolean;
  winnerLabel?: string;
  blocked: boolean;
}) {
  const decided = Boolean(winnerLabel);
  return (
    <div className="relative mx-auto -mt-1 w-fit">
      <div
        className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 ${
          blocked
            ? "border-red-400/40 bg-red-500/[0.07]"
            : decided
              ? "border-emerald-400/45 bg-emerald-500/[0.07]"
              : "border-blue-400/40 bg-blue-500/[0.07]"
        }`}
      >
        <span
          className={`grid size-8 place-items-center rounded-lg ${
            blocked
              ? "bg-red-400/15 text-red-300"
              : decided
                ? "bg-emerald-400/15 text-emerald-300"
                : "bg-blue-400/15 text-blue-300"
          }`}
        >
          {selecting ? (
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          ) : (
            <GitMerge size={17} aria-hidden="true" />
          )}
        </span>
        <div className="text-left">
          <p className="text-sm font-semibold text-zinc-100">Mixture-of-Agents</p>
          <p className="text-[11px] text-zinc-400">
            {blocked
              ? "no candidate cleared the gate"
              : decided
                ? `composed the strongest build · Worktree${winnerLabel && winnerLabel.includes("+") ? "s" : ""} ${winnerLabel}`
                : selecting
                  ? "scoring candidates — selecting the strongest build…"
                  : "awaiting candidates"}
          </p>
        </div>
      </div>
    </div>
  );
}

function DeployNode({
  gatePassed,
  overall,
  winnerLabel,
  previewUrl,
  deployUrl,
  artifactPath,
  selecting,
  hasRun,
}: {
  gatePassed: boolean;
  overall?: number;
  winnerLabel?: string;
  previewUrl?: string;
  deployUrl?: string;
  artifactPath?: string;
  selecting: boolean;
  hasRun: boolean;
}) {
  const live = Boolean(deployUrl);
  return (
    <div className={`glass relative mt-1 rounded-2xl p-5 ${live ? "ring-1 ring-emerald-400/45" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-11 place-items-center rounded-lg border ${
              live
                ? "border-emerald-400/45 bg-emerald-500/[0.1] text-emerald-300"
                : "border-white/10 bg-white/[0.04] text-zinc-300"
            }`}
          >
            <Rocket size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Codex Sites deploy</p>
            <p className="text-[12px] text-zinc-400">
              {live
                ? "live — single merged playable build"
                : gatePassed
                  ? `gate passed${winnerLabel ? ` · Worktree${winnerLabel.includes("+") ? "s" : ""} ${winnerLabel}` : ""} — deploying…`
                  : selecting
                    ? "waiting on Mixture-of-Agents selection"
                    : hasRun
                      ? "assembling the winning build"
                      : "idle — submit a build to begin"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {gatePassed ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/[0.08] px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <ShieldCheck size={14} aria-hidden="true" />
              gate {typeof overall === "number" ? overall.toFixed(2) : "passed"}
            </span>
          ) : null}
          {previewUrl ? (
            <a
              className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-100 no-underline transition hover:border-blue-400/50 hover:bg-blue-500/[0.1]"
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Play size={14} aria-hidden="true" />
              Play the build
            </a>
          ) : null}
        </div>
      </div>

      {deployUrl ? (
        <a
          className="mt-4 flex items-center gap-2 truncate rounded-lg border border-emerald-400/40 bg-emerald-500/[0.08] px-4 py-3 text-sm font-semibold text-emerald-200 no-underline transition hover:bg-emerald-500/[0.14]"
          href={deployUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Globe2 size={16} aria-hidden="true" />
          <span className="truncate">{deployUrl}</span>
        </a>
      ) : artifactPath ? (
        <p className="mt-3 truncate font-mono text-[11px] text-zinc-500" title={artifactPath}>
          artifact: {artifactPath}
        </p>
      ) : null}
    </div>
  );
}

function PipelineStatus({
  working,
  selecting,
  gatePassed,
  deployed,
}: {
  working: boolean;
  selecting: boolean;
  gatePassed: boolean;
  deployed: boolean;
}) {
  const stages = [
    { label: "build", active: working, done: selecting || gatePassed || deployed },
    { label: "select", active: selecting, done: gatePassed || deployed },
    { label: "gate", active: gatePassed && !deployed, done: deployed },
    { label: "deploy", active: deployed, done: deployed },
  ];
  return (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
      {stages.map((stage, index) => (
        <span key={stage.label} className="flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              stage.done ? "text-emerald-300" : stage.active ? "text-blue-300" : "text-zinc-600"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                stage.done ? "bg-emerald-400" : stage.active ? "bg-blue-400" : "bg-zinc-700"
              }`}
              style={stage.active ? { animation: "forgeBlink 1.2s ease-in-out infinite" } : undefined}
            />
            {stage.label}
          </span>
          {index < stages.length - 1 ? <span className="text-zinc-700">›</span> : null}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

function deriveColumns(task: Task): ForestColumn[] {
  const candidates = task.graph?.candidates ?? [];
  const selectedKeys = new Set((task.selected ?? []).map(candidateKey));

  if (candidates.length === 0) {
    return [0, 1, 2].map((index) => ({
      key: `placeholder-${index}`,
      label: AGENT_GLYPHS[index] ?? String(index + 1),
      componentId: "worktree",
      worktree: undefined,
      steps: [],
      overall: undefined,
      verdict: undefined,
      isWinner: false,
      status: "spawning" as ColumnStatus,
      currentAction: "spawning isolated worktree…",
    }));
  }

  const groups = new Map<string, ComponentCandidate[]>();
  for (const candidate of candidates) {
    const list = groups.get(candidate.componentId) ?? [];
    list.push(candidate);
    groups.set(candidate.componentId, list);
  }
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
  const racers = sorted[0] && sorted[0].length > 1 ? sorted[0] : candidates;

  return racers
    .slice()
    .sort((a, b) => a.variantId.localeCompare(b.variantId))
    .map((candidate, index) => {
      const isWinner = selectedKeys.has(candidateKey(candidate));
      const last = candidate.steps.at(-1);
      const overall = candidate.score?.overall;
      const status = columnStatus(candidate, isWinner);
      return {
        key: candidateKey(candidate),
        label: AGENT_GLYPHS[index] ?? String(index + 1),
        componentId: candidate.componentId,
        worktree: worktreeLeaf(candidate.worktree),
        steps: candidate.steps.map((step) => ({
          id: step.id,
          action: step.action,
          ts: step.ts,
          verdict: step.verdict,
          overall: step.scores?.overall,
        })),
        overall,
        verdict: scoreVerdict(overall),
        isWinner,
        status,
        currentAction:
          last?.action ?? (candidate.steps.length ? "working…" : "queued — waiting for first action…"),
      } satisfies ForestColumn;
    });
}

function columnStatus(candidate: ComponentCandidate, isWinner: boolean): ColumnStatus {
  if (isWinner) return "winner";
  const overall = candidate.score?.overall;
  if (typeof overall === "number") {
    if (overall < 0.7) return "blocked";
    return "done";
  }
  if (candidate.steps.length === 0) return "spawning";
  return "working";
}

function candidateKey(candidate: Pick<ComponentCandidate, "componentId" | "variantId">): string {
  return `${candidate.componentId}:${candidate.variantId}`;
}

function scoreVerdict(overall?: number): Verdict | undefined {
  if (typeof overall !== "number") return undefined;
  return overall >= 0.7 ? "pass" : "block";
}

function worktreeLeaf(worktree: string): string {
  const parts = worktree.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? worktree;
}

function trunkClass(status: ColumnStatus): string {
  if (status === "winner") return "trunk-win";
  if (status === "working" || status === "spawning") return "trunk-flow";
  return "trunk-idle";
}

function nodeDotClass(verdict: Verdict | undefined, isWinner: boolean, live: boolean): string {
  if (isWinner) return "bg-emerald-400";
  if (verdict === "block") return "bg-red-400";
  if (verdict === "pass") return "bg-emerald-400";
  if (live) return "bg-blue-400";
  return "bg-blue-400/70";
}

function statusAccent(status: ColumnStatus): { avatar: string; badge: string } {
  switch (status) {
    case "winner":
      return {
        avatar: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
        badge: "bg-emerald-500/12 text-emerald-300",
      };
    case "blocked":
      return {
        avatar: "border-red-400/40 bg-red-500/10 text-red-200",
        badge: "bg-red-500/12 text-red-300",
      };
    case "done":
      return {
        avatar: "border-white/12 bg-white/[0.04] text-zinc-100",
        badge: "bg-white/[0.06] text-zinc-300",
      };
    case "spawning":
      return {
        avatar: "border-amber-400/40 bg-amber-500/10 text-amber-200",
        badge: "bg-amber-500/12 text-amber-300",
      };
    default:
      return {
        avatar: "border-blue-400/45 bg-blue-500/10 text-blue-200",
        badge: "bg-blue-500/12 text-blue-300",
      };
  }
}

function statusLabel(status: ColumnStatus): string {
  switch (status) {
    case "winner":
      return "picked";
    case "blocked":
      return "below gate";
    case "done":
      return "ready";
    case "spawning":
      return "spawning";
    default:
      return "building";
  }
}

function statusIcon(status: ColumnStatus) {
  switch (status) {
    case "winner":
      return <Crown size={13} aria-hidden="true" />;
    case "blocked":
      return <TriangleAlert size={13} aria-hidden="true" />;
    case "done":
      return <CircleDot size={13} aria-hidden="true" />;
    case "spawning":
      return <CircleDashed size={13} aria-hidden="true" />;
    default:
      return <Loader2 size={13} className="animate-spin" aria-hidden="true" />;
  }
}
