import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
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
import { IntentCard } from "./components/IntentCard";
import { ShipHealStrip } from "./components/ShipHealStrip";
import { SwarmSection } from "./components/SwarmSection";
import type { Task, TaskUpdatedEvent } from "./shared/task";
import { connectTaskUpdates, type StreamMode } from "./stream/connectTaskUpdates";

const repo = import.meta.env.VITE_FORGE_REPO || "forge-demo";
const wsUrl = import.meta.env.VITE_FORGE_WS_URL || "ws://127.0.0.1:4317/ws";
const apiBase = import.meta.env.VITE_FORGE_API_URL || deriveApiBase(wsUrl);

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
const iconButton =
  "grid size-10 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950";

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [task, setTask] = useState<Task | null>(null);
  const [shipTask, setShipTask] = useState<Task | null>(null);
  const [feed, setFeed] = useState<string[]>([]);
  const [mode, setMode] = useState<StreamMode>("connecting");
  const [intent, setIntent] = useState("Build me a 3D game using three.js");
  const cleanupRef = useRef<(() => void) | null>(null);

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
    cleanupRef.current = connectTaskUpdates({
      wsUrl,
      onEvent: handleEvent,
      onModeChange: setMode,
    });

    return () => cleanupRef.current?.();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = intent.trim();
    if (!trimmed) return;

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
    } catch (error) {
      setFeed((current) => [
        `intake error: ${error instanceof Error ? error.message : String(error)}`,
        ...current,
      ]);
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
      />
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

interface LandingPageProps {
  mode: StreamMode;
  onNavigate: (path: string) => void;
  onRunDemo: () => void;
}

function LandingPage({ mode, onNavigate, onRunDemo }: LandingPageProps) {
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

          <div className={`${panel} overflow-hidden`}>
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
}: SurfacesPageProps) {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <TopNav mode={mode} onNavigate={onNavigate} route="surfaces" />

      <section className={`${pageWidth} py-6`}>
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className={eyebrow}>
              <LayoutDashboard size={16} aria-hidden="true" />
              Forge cockpit
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-zinc-950">
              Live task surface
            </h1>
          </div>
          <div className="text-sm text-zinc-500">
            Repo <span className="font-medium text-zinc-800">{repo}</span>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="grid gap-4">
            <div className={`${panel} p-4`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg border border-zinc-200 bg-white">
                    <Activity size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-950">Current Task</p>
                    <p className="text-sm text-zinc-500">{task.id}</p>
                  </div>
                </div>
                <StatusPill label={task.verdict} icon={<Cpu size={14} />} />
              </div>
            </div>

            <form className={`${panel} p-3`} onSubmit={onSubmit}>
              <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700">
                <Bot size={16} aria-hidden="true" />
                Agent intake
              </div>
              <label className="sr-only" htmlFor="intent-input">
                Intake
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)_40px_40px] gap-2">
                <input
                  className="h-10 min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400"
                  id="intent-input"
                  value={intent}
                  onChange={(event) => onIntentChange(event.target.value)}
                  placeholder="Type a task for Forge..."
                />
                <button className={iconButton} type="submit" aria-label="Create task">
                  <SendHorizonal size={17} aria-hidden="true" />
                </button>
                <button className={iconButton} type="button" onClick={onSwarm} aria-label="Run swarm">
                  <GitFork size={17} aria-hidden="true" />
                </button>
              </div>
            </form>

            <div className={`${panel} p-4`}>
              <div className="mb-3 flex items-center gap-3">
                <div className="grid size-8 place-items-center rounded-full bg-zinc-950 text-sm font-semibold text-white">
                  K
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-950">User</p>
                  <p className="text-xs text-zinc-500">plain-English request</p>
                </div>
              </div>
              <div className="rounded-xl rounded-tl-sm border border-zinc-200 bg-zinc-50 p-4 text-base font-medium text-zinc-800 [overflow-wrap:anywhere]">
                {task.intent}
              </div>
            </div>

            <IntentCard task={task} />
            <SwarmSection
              task={task}
              previewUrl={
                task.integration?.passed
                  ? `${apiBase}/preview/${encodeURIComponent(task.id)}`
                  : undefined
              }
            />
            <ShipHealStrip task={shipTask} feed={feed} />
          </section>

          <aside className="grid content-start gap-4">
            <ConfigPanel title="Configuration">
              <Field label="Runtime" value="Codex App Server" icon={<TerminalSquare size={18} />} />
              <Field label="Architecture" value="Swarm + Gate" icon={<ChevronDown size={18} />} />
              <Field label="Event channel" value="task.updated" icon={<RadioTower size={18} />} />
            </ConfigPanel>

            <ConfigPanel title="Adapters">
              <ToolToggle icon={<Bot size={18} />} label="Plain-English intake" />
              <ToolToggle icon={<Webhook size={18} />} label="CI regression webhook" />
              <ToolToggle icon={<GitFork size={18} />} label="Swarm trigger" />
              <ToolToggle icon={<Search size={18} />} label="Telemetry watcher" />
            </ConfigPanel>

            <ConfigPanel title="Instruction">
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700 [overflow-wrap:anywhere]">
                {task.intent}
              </p>
            </ConfigPanel>
          </aside>
        </div>
      </section>
    </main>
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

function StatusPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold uppercase text-zinc-700">
      {icon}
      {label}
    </span>
  );
}

function ConfigPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className={`${panel} p-4`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
        <ChevronUp size={18} className="text-zinc-400" aria-hidden="true" />
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Field({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-semibold text-zinc-800">
        <span>{value}</span>
        <span className="text-zinc-500">{icon}</span>
      </div>
    </div>
  );
}

function ToolToggle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3">
      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-800">
        {icon}
        {label}
      </span>
      <span
        className="inline-flex h-6 w-11 flex-none items-center justify-end rounded-full bg-emerald-600 px-1 text-white"
        aria-label={`${label} enabled`}
      >
        <Check size={14} aria-hidden="true" />
      </span>
    </div>
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
