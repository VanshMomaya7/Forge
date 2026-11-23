import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPreviewHtml, runTask, subscribe } from "@forge/core";
import express from "express";

import { taskFromGithubWebhook } from "../adapters/ciWebhook";
import { forkCurrentTask } from "../adapters/swarm";
import { startTelemetryWatcher } from "../adapters/telemetry";
import type { OrchestrationMode, Task, TaskOrigin, TaskUpdatedEvent } from "../shared/task";
import { TaskEventBus } from "./eventBus";
import { extractRouter } from "./extract";

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
const defaultMode = parseMode(process.env.FORGE_TASK_MODE) ?? "compose";

// Hard cap on agents a single swarm request may fork.
const MAX_SWARM_SIZE = 5;
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
const watchers = new Map<string, () => void>();

// The vite cockpit runs on a different port, so allow cross-origin API calls,
// but only from known cockpit origins — any other page in the browser must not
// be able to start real agent runs or deploys.
const allowedOrigins = new Set(
  (process.env.FORGE_ALLOWED_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    response.status(403).json({ error: "origin not allowed" });
    return;
  }
  if (origin) {
    response.header("Access-Control-Allow-Origin", origin);
    response.header("Vary", "Origin");
  }
  response.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.header("Access-Control-Allow-Headers", "Content-Type, X-File-Name");
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

// Raw-body upload routes go before the JSON parser.
app.use(extractRouter);

app.use(
  express.json({
    limit: "1mb",
    // Keep the raw bytes so the GitHub webhook signature can be verified.
    verify: (request, _response, buffer) => {
      (request as IncomingMessage & { rawBody?: Buffer }).rawBody = buffer;
    },
  }),
);

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

  const requestedMode = request.body?.mode;
  const mode = requestedMode === undefined ? defaultMode : parseMode(requestedMode);
  if (!mode) {
    response.status(400).json({ error: "mode must be 'race' or 'compose'" });
    return;
  }

  const task = createComposeTask(intent, {
    origin: "human",
    mode,
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
      n: Math.min(toPositiveInt(request.body?.n) ?? 3, MAX_SWARM_SIZE),
    });
    response.status(202).json({ children });
  } catch (error) {
    next(error);
  }
});

app.post("/webhook/github", (request, response) => {
  if (!webhookSecret) {
    response.status(503).json({ error: "GITHUB_WEBHOOK_SECRET is not configured" });
    return;
  }
  const rawBody = (request as IncomingMessage & { rawBody?: Buffer }).rawBody;
  if (!isValidGithubSignature(rawBody, request.header("x-hub-signature-256"), webhookSecret)) {
    response.status(401).json({ error: "invalid webhook signature" });
    return;
  }

  const task = taskFromGithubWebhook(request.body, repoRoot) as Task | null;
  if (!task) {
    response.status(202).json({ ignored: true });
    return;
  }

  // taskFromGithubWebhook stamps context.repo with the GitHub "owner/repo"
  // name (for display); orchestration needs the actual filesystem repo it
  // runs worktrees against, so keep the GitHub name and correct the path.
  task.context.githubRepo = task.context.repo;
  task.context.repo = repoRoot;

  // Self-healing loop: a failed CI check re-enters orchestration on its own —
  // no human promotes it. USE_REAL_CODEX / FORGE_DEPLOY still gate whether
  // that means real agent calls or the safe simulated build.
  upsert(task);
  void runComposeInBackground(task);
  response.status(202).json({ task });
});

app.post("/api/watch", (request, response) => {
  const task = tasks.get(String(request.body?.taskId ?? ""));
  const url = String(request.body?.url ?? task?.artifact?.deployUrl ?? "");

  if (!task || !url) {
    response.status(400).json({ error: "taskId and url are required" });
    return;
  }

  // One watcher per task; re-watching replaces the old one.
  watchers.get(task.id)?.();

  const stop = startTelemetryWatcher({
    task,
    url,
    intervalMs: Number(process.env.FORGE_TELEMETRY_INTERVAL_MS ?? 5000),
    thresholds: {
      p95Ms: Number(process.env.FORGE_TELEMETRY_P95_MS ?? 250),
      errorRate: Number(process.env.FORGE_TELEMETRY_ERROR_RATE ?? 0.02),
    },
    onTelemetry: upsert,
    onRegressionTask: (regressionTask) => {
      // Same closed loop: a telemetry breach dispatches straight back into
      // orchestration, unattended.
      upsert(regressionTask);
      void runComposeInBackground(regressionTask);
    },
  });

  // The watcher outlives this request (whose "close" fires as soon as the 202
  // is sent); it runs until DELETE /api/watch/:taskId stops it.
  watchers.set(task.id, stop);
  response.status(202).json({ watching: true });
});

app.delete("/api/watch/:taskId", (request, response) => {
  const stop = watchers.get(request.params.taskId);
  if (!stop) {
    response.status(404).json({ error: "no watcher for task" });
    return;
  }
  stop();
  watchers.delete(request.params.taskId);
  response.json({ watching: false });
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
    // Build on the latest state core emitted, not the stale submitted object,
    // so steps recorded before the failure are kept.
    const latest = tasks.get(task.id) ?? task;
    upsert({
      ...latest,
      verdict: "blocked",
      context: {
        ...latest.context,
        error: error instanceof Error ? error.message : String(error),
      },
      updatedAt: Date.now(),
    });
    console.error(`runTask failed for ${task.id}:`, error);
  }
}

function parseMode(value: unknown): OrchestrationMode | undefined {
  return value === "race" || value === "compose" ? value : undefined;
}

function isValidGithubSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
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
