import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPreviewHtml, runTask, subscribe } from "@forge/core";
import express from "express";

import { taskFromGithubWebhook } from "../adapters/ciWebhook";
import { forkCurrentTask } from "../adapters/swarm";
import { startTelemetryWatcher } from "../adapters/telemetry";
import type { OrchestrationMode, Task, TaskOrigin, TaskUpdatedEvent } from "../shared/task";
import { TaskEventBus } from "./eventBus";

const app = express();
const server = createServer(app);
export const bus = new TaskEventBus();
const tasks = new Map<string, Task>();

// The forge git repo root. Real Codex agents run in detached worktrees of this
// repo, so it must be the actual repository, not the surfaces package.
const repoRoot =
  process.env.FORGE_REPO_ROOT ??
  path.resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const port = Number(process.env.FORGE_SURFACES_PORT ?? 4317);
const defaultMode = (process.env.FORGE_TASK_MODE as OrchestrationMode) ?? "compose";

// The vite cockpit runs on a different port, so allow cross-origin API calls.
app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", request.headers.origin ?? "*");
  response.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.header("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_request, response) => {
  response.json({ ok: true, repoRoot, mode: defaultMode });
});

app.get("/api/tasks", (_request, response) => {
  response.json({ tasks: [...tasks.values()] });
});

app.get("/api/tasks/:id", (request, response) => {
  const task = tasks.get(request.params.id);
  if (!task) {
    response.status(404).json({ error: "task not found" });
    return;
  }
  response.json({ task });
});

// Plain-English intake -> real compose Task -> @forge/core.runTask (async).
// We return 202 immediately; progress streams over /ws as core emits updates.
app.post("/api/intake", (request, response) => {
  const intent = String(request.body?.intent ?? "").trim();
  if (!intent) {
    response.status(400).json({ error: "intent is required" });
    return;
  }

  const task = createComposeTask(intent, {
    origin: "human",
    mode: String(request.body?.mode ?? defaultMode) as OrchestrationMode,
    variants: request.body?.variants,
    maxSteps: request.body?.maxSteps,
  });

  upsert(task);
  void runComposeInBackground(task);
  response.status(202).json({ task });
});

app.post("/api/tasks/:id/swarm", async (request, response, next) => {
  try {
    const task = tasks.get(request.params.id);
    if (!task) {
      response.status(404).json({ error: "task not found" });
      return;
    }

    const children = await forkCurrentTask(task, {
      n: Number(request.body?.n ?? 3),
    });
    response.status(202).json({ children });
  } catch (error) {
    next(error);
  }
});

app.post("/webhook/github", (request, response) => {
  const task = taskFromGithubWebhook(request.body, repoRoot) as Task | null;
  if (!task) {
    response.status(202).json({ ignored: true });
    return;
  }

  // Persist the regression task but do not auto-spawn real agents on CI noise;
  // a human promotes it from the cockpit via /api/intake when ready.
  upsert(task);
  response.status(202).json({ task });
});

app.post("/api/watch", (request, response) => {
  const task = tasks.get(String(request.body?.taskId ?? ""));
  const url = String(request.body?.url ?? task?.artifact?.deployUrl ?? "");

  if (!task || !url) {
    response.status(400).json({ error: "taskId and url are required" });
    return;
  }

  const stop = startTelemetryWatcher({
    task,
    url,
    intervalMs: Number(process.env.FORGE_TELEMETRY_INTERVAL_MS ?? 5000),
    thresholds: {
      p95Ms: Number(process.env.FORGE_TELEMETRY_P95_MS ?? 250),
      errorRate: Number(process.env.FORGE_TELEMETRY_ERROR_RATE ?? 0.02),
    },
    onTelemetry: upsert,
    onRegressionTask: upsert,
  });

  request.on("close", stop);
  response.status(202).json({ watching: true });
});

// Playable preview of the winning Game.tsx for a task, served straight from the
// on-disk artifact (so it works across server restarts, by task id).
app.get("/preview/:id", async (request, response) => {
  try {
    const artifactRoot = path.resolve(
      repoRoot,
      "..",
      "forge-sites",
      sanitizeId(request.params.id),
    );
    const html = await buildPreviewHtml(artifactRoot);
    response.type("html").send(html);
  } catch (error) {
    response
      .status(404)
      .send(`preview unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next;
    const message = error instanceof Error ? error.message : "unexpected error";
    response.status(500).json({ error: message });
  },
);

// Bridge: every task.updated emitted by @forge/core (decompose, candidate
// steps, selection, integration gate, deploy) is persisted and broadcast to ws.
subscribe((event: TaskUpdatedEvent) => upsert(event.task));

bus.attach(server);

// Guarded so tests can import the wiring (createComposeTask + bus bridge)
// without binding the port.
if (process.env.FORGE_NO_LISTEN !== "1") {
  server.listen(port, "127.0.0.1", () => {
    console.log(`Forge surfaces server listening on http://127.0.0.1:${port}`);
    console.log(`  repoRoot=${repoRoot} mode=${defaultMode}`);
    console.log(`  real Codex: USE_REAL_CODEX=${process.env.USE_REAL_CODEX ?? "(unset)"}`);
  });
}

interface ComposeTaskOptions {
  origin: TaskOrigin;
  mode: OrchestrationMode;
  variants?: unknown;
  maxSteps?: unknown;
}

export function createComposeTask(intent: string, options: ComposeTaskOptions): Task {
  const now = Date.now();
  const id = `${options.origin}-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const context: Task["context"] = {
    repo: repoRoot,
    worktreeRoot: path.join(repoRoot, "forge-worktrees", id),
  };

  const variants = toPositiveInt(options.variants);
  if (variants !== undefined) context.variants = variants;
  const maxSteps = toPositiveInt(options.maxSteps ?? process.env.FORGE_MAX_STEPS);
  if (maxSteps !== undefined) context.maxSteps = maxSteps;

  return {
    id,
    origin: options.origin,
    intent,
    context,
    mode: options.mode,
    steps: [],
    verdict: "running",
    createdAt: now,
    updatedAt: now,
  };
}

async function runComposeInBackground(task: Task): Promise<void> {
  try {
    const final = await runTask(task);
    upsert(final);
  } catch (error) {
    task.verdict = "blocked";
    task.context = {
      ...task.context,
      error: error instanceof Error ? error.message : String(error),
    };
    task.updatedAt = Date.now();
    upsert(task);
    console.error(`runTask failed for ${task.id}:`, error);
  }
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 96);
}

function toPositiveInt(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

function upsert(task: Task): void {
  tasks.set(task.id, task);
  bus.emit({ type: "task.updated", task });
}
