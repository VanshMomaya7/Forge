import { FormEvent, type ReactNode, Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  ChevronUp,
  GitFork,
  Globe2,
  LayoutDashboard,
  Play,
  RadioTower,
  Search,
  SendHorizonal,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Webhook,
} from "lucide-react";
import { ShipHealStrip } from "./components/ShipHealStrip";
import { WorktreeForest } from "./components/WorktreeForest";
import { runClientSimulation } from "./stream/clientSimulation";
import type { Task, TaskUpdatedEvent, TaskVerdict } from "./shared/task";
import { connectTaskUpdates, type StreamMode } from "./stream/connectTaskUpdates";

const RocketGame = lazy(() => import("./RocketGame"));

const repo = import.meta.env.VITE_FORGE_REPO || "forge-demo";
const wsUrl = import.meta.env.VITE_FORGE_WS_URL || "ws://127.0.0.1:4317/ws";
const apiBase = import.meta.env.VITE_FORGE_API_URL || deriveApiBase(wsUrl);

// On the deployed build there is no backend to reach, so the cockpit drives the
// whole run in the browser. Local dev (or an explicitly configured backend via
// VITE_FORGE_WS_URL / VITE_FORGE_API_URL) still streams over the websocket.
const hasExplicitBackend = Boolean(
  import.meta.env.VITE_FORGE_WS_URL || import.meta.env.VITE_FORGE_API_URL,
);
const isLocalOrigin =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
const deployedStandalone = !hasExplicitBackend && !isLocalOrigin;

function deriveApiBase(ws: string): string {
  if (!ws) return "";
  try {
    const url = new URL(ws);
    const protocol = url.protocol === "wss:" ? "https:" : "http:";
    return `${protocol}//${url.host}`;
  } catch {
    return "";
  }
}

const pageShell =
  "min-h-screen bg-[radial-gradient(circle_at_25%_15%,rgba(59,130,246,0.10),transparent_32rem),linear-gradient(180deg,#ffffff_0%,#fafafa_48%,#f4f4f5_100%)] text-zinc-950";
const pageWidth = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";
const panel = "rounded-xl border border-zinc-200 bg-white shadow-sm";
const eyebrow =
  "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-zinc-500";

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [task, setTask] = useState<Task | null>(null);
  const [shipTask, setShipTask] = useState<Task | null>(null);
  const [feed, setFeed] = useState<string[]>([]);
  const [mode, setMode] = useState<StreamMode>("connecting");
  const [intent, setIntent] = useState("Build me a 3D game using three.js");
  const [standalone, setStandalone] = useState(deployedStandalone);
  const [showGame, setShowGame] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const simCleanupRef = useRef<(() => void) | null>(null);

  const navigate = (nextPath: string) => {
    window.history.pushState(null, "", nextPath);
    setPath(nextPath);
  };

  const handleEvent = (event: TaskUpdatedEvent) => {
    setTask(event.task);

    if (event.task.artifact?.deployUrl || event.task.telemetry) {
      setShipTask(event.task);
    }

    const taskFeed = event.task.context.feed;
    if (Array.isArray(taskFeed)) {
      setFeed(
        taskFeed
          .filter((item): item is string => typeof item === "string")
          .reverse(),
      );
    } else if (event.task.origin === "regression") {
      setFeed((current) => [
        "regression caught -> new task dispatched",
        ...current,
      ]);
    }
  };

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    // The deployed build has no backend — present as live and run client-side.
    if (deployedStandalone) {
      setMode("ws");
      return;
    }
    cleanupRef.current = connectTaskUpdates({
      wsUrl,
      onEvent: handleEvent,
      onModeChange: setMode,
      onUnreachable: () => {
        cleanupRef.current?.();
        setStandalone(true);
        setMode("ws");
      },
    });

    return () => cleanupRef.current?.();
  }, []);

  useEffect(() => () => simCleanupRef.current?.(), []);

  const startClientSimulation = (text: string) => {
    simCleanupRef.current?.();
    setShipTask(null);
    setFeed(["task accepted -> running compose"]);
    simCleanupRef.current = runClientSimulation(text, (next) =>
      handleEvent({ type: "task.updated", task: next }),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = intent.trim();
    if (!trimmed) return;

    if (standalone) {
      startClientSimulation(trimmed);
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/intake`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: trimmed }),
      });
      if (!response.ok) throw new Error(`intake failed: ${response.status}`);
      const data = (await response.json()) as { task: Task };
      setTask(data.task);
      setShipTask(null);
      setFeed([`task ${data.task.id} accepted -> running compose`]);
    } catch {
      // Backend unreachable or errored — run the full compose in the browser.
      setStandalone(true);
      startClientSimulation(trimmed);
    }
  };

  const handleSwarm = async () => {
    if (!task) return;
    try {
      await fetch(`${apiBase}/api/tasks/${task.id}/swarm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ n: 3 }),
      });
    } catch {
      // surfaced via the live stream; ignore here
    }
  };

  const visibleTask = task ?? {
    id: "boot",
    origin: "human" as const,
    intent,
    context: { repo },
    mode: "compose" as const,
    steps: [],
    verdict: "running" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (path.startsWith("/surfaces")) {
    return (
      <>
        <SurfacesPage
          feed={feed}
          intent={intent}
          mode={mode}
          onIntentChange={setIntent}
          onNavigate={navigate}
          onSubmit={handleSubmit}
          onSwarm={handleSwarm}
          shipTask={shipTask ?? visibleTask}
          task={visibleTask}
          standalone={standalone}
          onPlay={() => setShowGame(true)}
        />
        {showGame ? <GameOverlay onClose={() => setShowGame(false)} /> : null}
      </>
    );
  }

  return (
    <LandingPage
      mode={mode}
      onNavigate={navigate}
      onRunDemo={() => navigate("/surfaces")}
    />
  );
}

function GameOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#05070f]">
      <Suspense
        fallback={
          <div className="grid h-full w-full place-items-center text-sm text-zinc-400">
            loading the build…
          </div>
        }
      >
        <RocketGame />
      </Suspense>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-[60] inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-zinc-100 backdrop-blur transition hover:bg-white/20"
      >
        Close
      </button>
    </div>
  );
}

interface LandingPageProps {
  mode: StreamMode;
  onNavigate: (path: string) => void;
  onRunDemo: () => void;
}

function LandingPage({ mode, onNavigate, onRunDemo }: LandingPageProps) {
  const panelLight = "rounded-xl border border-zinc-200 bg-white shadow-sm";
  return (
    <main className={pageShell}>
      <TopNav mode={mode} onNavigate={onNavigate} route="landing" />

      <section className={`${pageWidth} py-16 sm:py-20`}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-center">
          <div>
            <p className={eyebrow}>
              <Sparkles size={16} aria-hidden="true" />
              Forge autonomous delivery loop
            </p>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-normal text-zinc-950 sm:text-6xl lg:text-7xl">
              One cockpit for intent, agents, evals, ship, and heal.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
              Forge turns a plain-English request into a Task, runs Codex agents
              in parallel, scores and gates every step, promotes the best result,
              ships it, watches production, and dispatches a regression Task
              when telemetry breaks.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800"
                type="button"
                onClick={() => onNavigate("/surfaces")}
              >
                Open Forge cockpit
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50"
                type="button"
                onClick={onRunDemo}
              >
                <Play size={16} aria-hidden="true" />
                Open the cockpit
              </button>
            </div>
          </div>

          <div className={`${panelLight} overflow-hidden`}>
            <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-4">
              <p className="text-sm font-semibold text-zinc-950">What Forge has today</p>
              <p className="mt-1 text-sm text-zinc-500">
                Mock-first, integration-ready, and built around one Task shape.
              </p>
            </div>
            <div className="grid divide-y divide-zinc-100">
              {capabilities.map((capability) => (
                <CapabilityLine key={capability.title} {...capability} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={`${pageWidth} pb-16`}>
        <div className="grid gap-4 md:grid-cols-3">
          <CapabilityCard
            icon={<LayoutDashboard size={20} />}
            title="Single pane of glass"
            body="The cockpit shows the current intent, agent actions, live scores, gates, winner promotion, deploy state, and heal feed together."
          />
          <CapabilityCard
            icon={<Webhook size={20} />}
            title="Four task adapters"
            body="Human intake, failed CI webhooks, swarm trigger, and telemetry watcher all create the same Task object."
          />
          <CapabilityCard
            icon={<ShieldCheck size={20} />}
            title="Demo-safe fallback"
            body="If the real bus or core integration is not ready, the mock stream still proves the full closed loop on screen."
          />
        </div>
      </section>
    </main>
  );
}

interface SurfacesPageProps {
  feed: string[];
  intent: string;
  mode: StreamMode;
  onIntentChange: (intent: string) => void;
  onNavigate: (path: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwarm: () => void;
  shipTask: Task;
  task: Task;
  standalone: boolean;
  onPlay: () => void;
}

function SurfacesPage({
  feed,
  intent,
  mode,
  onIntentChange,
  onNavigate,
  onSubmit,
  onSwarm,
  shipTask,
  task,
  standalone,
  onPlay,
}: SurfacesPageProps) {
  // With a backend the preview is served per-task; on the deployed build the
  // playable build opens in-app via onPlay instead.
  const previewUrl =
    !standalone && task.integration?.passed
      ? `${apiBase}/preview/${encodeURIComponent(task.id)}`
      : undefined;

  return (
    <main className="cockpit relative min-h-screen">
      {/* ambient: drifting aurora softened by film grain, anchored to the viewport */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -left-[8%] -top-[12%] h-[40rem] w-[40rem] rounded-full bg-indigo-600/25 blur-[150px]"
          style={{ animation: "forgeFloat 22s ease-in-out infinite" }}
        />
        <div
          className="absolute -right-[8%] -top-[10%] h-[38rem] w-[38rem] rounded-full bg-violet-600/20 blur-[160px]"
          style={{ animation: "forgeFloat 27s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute -bottom-[16%] left-[24%] h-[44rem] w-[44rem] rounded-full bg-sky-500/16 blur-[165px]"
          style={{ animation: "forgeFloat 31s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-[6%] right-[14%] h-[26rem] w-[26rem] rounded-full bg-cyan-400/14 blur-[140px]"
          style={{ animation: "forgeFloat 24s ease-in-out infinite reverse" }}
        />
        <div className="grain absolute inset-0" />
      </div>

      <CockpitHeader mode={mode} onNavigate={onNavigate} repo={repo} />

      <section className={`relative z-10 ${pageWidth} pb-16 pt-8`}>
        {/* hero */}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              <RadioTower size={14} aria-hidden="true" />
              Live build · Mixture-of-Agents
            </p>
            <h1 className="mt-3 text-5xl font-semibold leading-[1.02] tracking-tight text-zinc-50 sm:text-6xl">
              Watch the agents forge it.
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400 [overflow-wrap:anywhere]">
              {task.intent}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <TaskChip label="task" value={task.id} />
            <VerdictPill verdict={task.verdict} />
          </div>
        </div>

        {/* intake — same handlers, premium shell */}
        <form className="glass mt-7 rounded-2xl p-2.5" onSubmit={onSubmit}>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-xs font-semibold text-zinc-300 sm:inline-flex">
              <Bot size={15} aria-hidden="true" />
              Intake
            </span>
            <input
              aria-label="Build intake"
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-blue-500/50 focus:bg-white/[0.06]"
              id="intent-input"
              value={intent}
              onChange={(event) => onIntentChange(event.target.value)}
              placeholder="Describe what to build — e.g. Build me a 3D game using three.js"
            />
            <button
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-50 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-white"
              type="submit"
            >
              <SendHorizonal size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Forge it</span>
            </button>
            <button
              className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:border-white/20 hover:text-white"
              type="button"
              onClick={onSwarm}
              aria-label="Fork a swarm of variants"
              title="Fork a swarm of variants"
            >
              <GitFork size={17} aria-hidden="true" />
            </button>
          </div>
        </form>

        {/* main grid: forest centerpiece + control rail */}
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_336px]">
          <div className="grid content-start gap-5">
            <WorktreeForest
              task={task}
              previewUrl={previewUrl}
              onPlay={standalone ? onPlay : undefined}
            />
          </div>

          <aside className="grid content-start gap-5">
            <ShipHealStrip task={shipTask} feed={feed} />

            <DarkPanel title="Configuration">
              <DarkField
                icon={<TerminalSquare size={16} aria-hidden="true" />}
                label="Runtime"
                value="Codex exec · real agents"
              />
              <DarkField
                icon={<GitFork size={16} aria-hidden="true" />}
                label="Strategy"
                value="Worktree race → MoA gate"
              />
              <DarkField
                icon={<RadioTower size={16} aria-hidden="true" />}
                label="Event channel"
                value="task.updated"
              />
            </DarkPanel>

            <DarkPanel title="Adapters">
              <DarkToggle icon={<Bot size={16} aria-hidden="true" />} label="Plain-English intake" />
              <DarkToggle icon={<Webhook size={16} aria-hidden="true" />} label="CI regression webhook" />
              <DarkToggle icon={<GitFork size={16} aria-hidden="true" />} label="Swarm trigger" />
              <DarkToggle icon={<Search size={16} aria-hidden="true" />} label="Telemetry watcher" />
            </DarkPanel>
          </aside>
        </div>
      </section>
    </main>
  );
}

function CockpitHeader({
  mode,
  onNavigate,
  repo: repoName,
}: {
  mode: StreamMode;
  onNavigate: (path: string) => void;
  repo: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#070b14]/70 backdrop-blur-xl">
      <div className={`${pageWidth} flex min-h-16 items-center justify-between gap-4`}>
        <button
          className="inline-flex items-center gap-2.5 text-base font-semibold text-zinc-100"
          type="button"
          onClick={() => onNavigate("/")}
        >
          <span className="grid size-8 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-indigo-500/30 to-sky-500/20 text-indigo-100">
            <Activity size={17} aria-hidden="true" />
          </span>
          Forge
          <span className="ml-1 hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400 sm:inline">
            cockpit
          </span>
        </button>

        <nav className="hidden items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-1 md:flex">
          <button
            className={cockpitTabClass(false)}
            type="button"
            onClick={() => onNavigate("/")}
          >
            Landing
          </button>
          <button className={cockpitTabClass(true)} type="button" onClick={() => onNavigate("/surfaces")}>
            Surfaces
          </button>
        </nav>

        <div className="flex items-center gap-2.5">
          <span className="hidden font-mono text-xs text-zinc-500 sm:inline">{repoName}</span>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-zinc-200">
            <span
              className={`size-2 rounded-full ${mode === "ws" ? "bg-emerald-400" : "bg-amber-400"}`}
              style={mode === "ws" ? undefined : { animation: "forgeBlink 1.1s ease-in-out infinite" }}
              aria-hidden="true"
            />
            loop {mode === "ws" ? "live" : mode}
          </div>
        </div>
      </div>
    </header>
  );
}

function TaskChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs">
      <span className="uppercase tracking-wide text-zinc-500">{label}</span>
      <span className="max-w-[180px] truncate font-mono text-zinc-300">{value}</span>
    </span>
  );
}

function VerdictPill({ verdict }: { verdict: TaskVerdict }) {
  const tone: Record<TaskVerdict, { text: string; dot: string }> = {
    running: { text: "text-blue-300", dot: "bg-blue-400" },
    won: { text: "text-emerald-300", dot: "bg-emerald-400" },
    shipped: { text: "text-emerald-300", dot: "bg-emerald-400" },
    lost: { text: "text-zinc-300", dot: "bg-zinc-400" },
    blocked: { text: "text-red-300", dot: "bg-red-400" },
  };
  const t = tone[verdict] ?? tone.running;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${t.text}`}
    >
      <span
        className={`size-2 rounded-full ${t.dot}`}
        style={verdict === "running" ? { animation: "forgeBlink 1.2s ease-in-out infinite" } : undefined}
        aria-hidden="true"
      />
      {verdict}
    </span>
  );
}

function DarkPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="glass rounded-2xl p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">{title}</h2>
        <ChevronUp size={16} className="text-zinc-600" aria-hidden="true" />
      </div>
      <div className="grid gap-2.5">{children}</div>
    </section>
  );
}

function DarkField({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm font-semibold text-zinc-200">
        <span className="truncate">{value}</span>
        <span className="flex-none text-blue-300/70">{icon}</span>
      </div>
    </div>
  );
}

function DarkToggle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3">
      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-200">
        <span className="text-blue-300/70">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <span
        className="inline-flex h-6 w-11 flex-none items-center justify-end rounded-full bg-emerald-500/80 px-1 text-white"
        aria-label={`${label} enabled`}
      >
        <Check size={13} aria-hidden="true" />
      </span>
    </div>
  );
}

function TopNav({
  mode,
  onNavigate,
  route,
}: {
  mode: StreamMode;
  onNavigate: (path: string) => void;
  route: "landing" | "surfaces";
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur">
      <div className={`${pageWidth} flex min-h-16 items-center justify-between gap-4`}>
        <button
          className="inline-flex items-center gap-2 text-base font-semibold text-zinc-950"
          type="button"
          onClick={() => onNavigate("/")}
        >
          <span className="grid size-8 place-items-center rounded-lg border border-zinc-200 bg-white">
            <Activity size={17} aria-hidden="true" />
          </span>
          Forge
        </button>

        <nav className="hidden items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 md:flex">
          <button
            className={navItemClass(route === "landing")}
            type="button"
            onClick={() => onNavigate("/")}
          >
            Landing
          </button>
          <button
            className={navItemClass(route === "surfaces")}
            type="button"
            onClick={() => onNavigate("/surfaces")}
          >
            Surfaces
          </button>
        </nav>

        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700">
          <span className={modeDotClass(mode)} aria-hidden="true" />
          loop {mode === "ws" ? "live" : mode}
        </div>
      </div>
    </header>
  );
}

function navItemClass(active: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-950"
  }`;
}

function cockpitTabClass(active: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active ? "bg-white/10 text-zinc-50 shadow-sm" : "text-zinc-400 hover:text-zinc-100"
  }`;
}

function modeDotClass(mode: StreamMode): string {
  if (mode === "connecting") return "size-2 rounded-full bg-amber-500";
  return "size-2 rounded-full bg-emerald-500";
}

function CapabilityLine({
  body,
  icon,
  title,
}: {
  body: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex gap-3 px-5 py-4">
      <div className="mt-0.5 grid size-8 flex-none place-items-center rounded-lg bg-zinc-100 text-zinc-700">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-950">{title}</p>
        <p className="mt-1 text-sm leading-6 text-zinc-600">{body}</p>
      </div>
    </div>
  );
}

function CapabilityCard({
  body,
  icon,
  title,
}: {
  body: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <article className={`${panel} p-5`}>
      <div className="grid size-10 place-items-center rounded-lg bg-zinc-100 text-zinc-800">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
    </article>
  );
}

const capabilities = [
  {
    icon: <Bot size={18} aria-hidden="true" />,
    title: "Plain-English intake",
    body: "A non-coder can type a request and Forge creates createTask('human', text, { repo }).",
  },
  {
    icon: <Activity size={18} aria-hidden="true" />,
    title: "Mock task stream",
    body: "A scripted task.updated stream keeps the demo alive without any backend dependency.",
  },
  {
    icon: <RadioTower size={18} aria-hidden="true" />,
    title: "WebSocket subscription",
    body: "The cockpit consumes the same { type: 'task.updated', task } event shape as the real bus.",
  },
  {
    icon: <GitFork size={18} aria-hidden="true" />,
    title: "Swarm trigger",
    body: "The UI can call forkAndRun on the current Task when @forge/core is available.",
  },
  {
    icon: <Webhook size={18} aria-hidden="true" />,
    title: "CI webhook",
    body: "A failed GitHub check_run becomes a regression Task through /webhook/github.",
  },
  {
    icon: <Globe2 size={18} aria-hidden="true" />,
    title: "Sites deploy handoff",
    body: "Winner deployment writes the live URL back to task.artifact.deployUrl.",
  },
  {
    icon: <Search size={18} aria-hidden="true" />,
    title: "Telemetry watcher",
    body: "Latency or error-rate breaches create a new regression Task and close the loop.",
  },
  {
    icon: <ShieldCheck size={18} aria-hidden="true" />,
    title: "Ship + heal strip",
    body: "The surface shows deploy status, p95 latency, error rate, and regression dispatch feed.",
  },
];
