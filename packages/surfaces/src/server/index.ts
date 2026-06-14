import express from "express";
import { createServer } from "node:http";
import type { Task } from "../shared/task";
import { taskFromGithubWebhook } from "../adapters/ciWebhook";
import { submitIntake } from "../adapters/intake";
import { forkCurrentTask } from "../adapters/swarm";
import { startTelemetryWatcher } from "../adapters/telemetry";
import { TaskEventBus } from "./eventBus";

const app = express();
const server = createServer(app);
const bus = new TaskEventBus();
const tasks = new Map<string, Task>();

const repo = process.env.FORGE_REPO ?? "forge-demo";
const port = Number(process.env.FORGE_SURFACES_PORT ?? 4317);

app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/tasks", (_request, response) => {
  response.json({ tasks: [...tasks.values()] });
});

app.post("/api/intake", async (request, response, next) => {
  try {
    const intent = String(request.body?.intent ?? "").trim();
    if (!intent) {
      response.status(400).json({ error: "intent is required" });
      return;
    }

    const task = await submitIntake(intent, {
      repo: String(request.body?.repo ?? repo),
      n: Number(request.body?.n ?? 3),
      onTask: upsert,
    });
    response.status(202).json({ task });
  } catch (error) {
    next(error);
  }
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
  const task = taskFromGithubWebhook(request.body, repo);
  if (!task) {
    response.status(202).json({ ignored: true });
    return;
  }

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

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unexpected error";
  response.status(500).json({ error: message });
});

bus.attach(server);

server.listen(port, "127.0.0.1", () => {
  console.log(`Forge surfaces server listening on http://127.0.0.1:${port}`);
});

function upsert(task: Task): void {
  tasks.set(task.id, task);
  bus.emit({ type: "task.updated", task });
}
