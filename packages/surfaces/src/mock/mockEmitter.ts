import type { ScoreResult, Step, Task, TaskOrigin, TaskUpdatedEvent, Verdict } from "../shared/task";
import { copyTask, createTask } from "../task/createTask";

export interface MockEmitterOptions {
  onEvent: (event: TaskUpdatedEvent) => void;
  baseTask?: Task;
  intent?: string;
  origin?: TaskOrigin;
  repo?: string;
  intervalMs?: number;
  loop?: boolean;
}

const defaultIntent = "Add rate-limiting to /api/login";
const defaultDeployUrl = "https://forge-demo.sites.openai.com";

export function startMockTaskStream(options: MockEmitterOptions): () => void {
  const interval = options.intervalMs ?? 650;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;

  const schedule = (index: number, action: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) action();
    }, index * interval);
    timers.add(timer);
  };

  const runSequence = () => {
    let task =
      options.baseTask ??
      createTask(options.origin ?? "human", options.intent ?? defaultIntent, {
        repo: options.repo ?? "forge-demo",
      });

    const emit = () => options.onEvent({ type: "task.updated", task: copyTask(task) });
    const pushStep = (
      agentId: string,
      action: string,
      output: string,
      overall: number,
      verdict: Verdict = "pass",
    ) => {
      const step: Step = {
        id: `${agentId}-${task.steps.length + 1}`,
        agentId,
        action,
        output,
        scores: score(overall),
        verdict,
        ts: Date.now(),
      };
      task = {
        ...task,
        steps: [...task.steps, step],
        updatedAt: step.ts,
      };
      emit();
    };

    schedule(0, emit);
    schedule(1, () =>
      pushStep(
        "codex-a",
        "token-bucket middleware",
        "Added request window planning around /api/login.",
        0.74,
      ),
    );
    schedule(2, () =>
      pushStep(
        "codex-b",
        "Redis sliding window",
        "Drafted shared limiter with burst allowance and TTL cleanup.",
        0.79,
      ),
    );
    schedule(3, () =>
      pushStep(
        "codex-c",
        "in-memory counter",
        "Added a local process counter for login attempts.",
        0.66,
        "redirect",
      ),
    );
    schedule(4, () =>
      pushStep(
        "codex-a",
        "tests passing",
        "Unit tests cover allowed, throttled, and reset flows.",
        0.91,
      ),
    );
    schedule(5, () =>
      pushStep(
        "codex-b",
        "score lead",
        "Integration test confirms distributed limiter behavior.",
        0.96,
      ),
    );
    schedule(6, () =>
      pushStep(
        "codex-c",
        "blocked: not distributed",
        "Fails the deploy plan because counters vanish across workers.",
        0.62,
        "block",
      ),
    );
    schedule(7, () => {
      task = {
        ...task,
        verdict: "shipped",
        context: {
          ...task.context,
          promotedAgentId: "codex-b",
          feed: ["winner promoted", "deploy started"],
        },
        artifact: { ...task.artifact, deployUrl: defaultDeployUrl },
        telemetry: { p95Ms: 42, errorRate: 0 },
        scores: score(0.96),
        updatedAt: Date.now(),
      };
      emit();
    });
    schedule(8, () => {
      task = {
        ...task,
        telemetry: { p95Ms: 268, errorRate: 0.038 },
        context: {
          ...task.context,
          feed: ["regression caught 2m ago -> dispatched"],
        },
        updatedAt: Date.now(),
      };
      emit();
    });
    schedule(9, () => {
      task = createTask(
        "regression",
        "Fix the live /api/login latency regression",
        {
          repo: task.context.repo,
          feed: ["regression caught -> new task dispatched"],
          failingTrace: {
            deployUrl: task.artifact?.deployUrl,
            p95Ms: task.telemetry?.p95Ms,
            errorRate: task.telemetry?.errorRate,
          },
        },
      );
      emit();
    });
    schedule(10, () =>
      pushStep(
        "codex-a",
        "reproduce latency breach",
        "Pulled the failing trace and reproduced the slow login path.",
        0.73,
      ),
    );
    schedule(11, () =>
      pushStep(
        "codex-b",
        "inspect limiter hot path",
        "Found excess Redis round-trips in the promoted limiter.",
        0.86,
      ),
    );
    schedule(12, () =>
      pushStep(
        "codex-c",
        "add failing regression test",
        "Captured the p95 breach as a repeatable test case.",
        0.81,
      ),
    );

    if (options.loop) {
      schedule(18, runSequence);
    }
  };

  runSequence();

  return () => {
    disposed = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
}

function score(overall: number): ScoreResult {
  return {
    rubricPass: overall >= 0.7,
    planAdherence: clamp(overall + 0.01),
    toolCorrectness: clamp(overall - 0.03),
    taskCompletion: clamp(overall + 0.02),
    overall: clamp(overall),
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
