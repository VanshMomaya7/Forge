import type { Task } from "../shared/task";
import { createTask } from "../task/createTask";

export interface TelemetryThresholds {
  p95Ms: number;
  errorRate: number;
  sampleSize?: number;
}

export interface TelemetryWatcherOptions {
  task: Task;
  url: string;
  intervalMs: number;
  thresholds: TelemetryThresholds;
  fetchImpl?: typeof fetch;
  onTelemetry?: (task: Task) => void;
  onRegressionTask?: (task: Task) => void;
}

interface Sample {
  ok: boolean;
  latencyMs: number;
  status?: number;
}

export function startTelemetryWatcher(
  options: TelemetryWatcherOptions,
): () => void {
  const samples: Sample[] = [];
  const fetcher = options.fetchImpl ?? fetch;
  const sampleSize = options.thresholds.sampleSize ?? 12;
  let dispatchedRegression = false;
  let disposed = false;

  const tick = async () => {
    const startedAt = Date.now();
    let sample: Sample;

    try {
      const response = await fetcher(options.url, { cache: "no-store" });
      sample = {
        ok: response.ok,
        latencyMs: Date.now() - startedAt,
        status: response.status,
      };
    } catch {
      sample = {
        ok: false,
        latencyMs: Date.now() - startedAt,
      };
    }

    if (disposed) return;

    samples.push(sample);
    while (samples.length > sampleSize) samples.shift();

    const telemetry = {
      p95Ms: percentile(samples.map((item) => item.latencyMs), 0.95),
      errorRate: samples.filter((item) => !item.ok).length / samples.length,
    };
    const taskWithTelemetry: Task = {
      ...options.task,
      telemetry,
      updatedAt: Date.now(),
    };
    options.onTelemetry?.(taskWithTelemetry);

    const breached =
      telemetry.p95Ms > options.thresholds.p95Ms ||
      telemetry.errorRate > options.thresholds.errorRate;

    if (breached && !dispatchedRegression) {
      dispatchedRegression = true;
      options.onRegressionTask?.(
        createTask("regression", "fix the regression", {
          repo: options.task.context.repo,
          failingTrace: {
            deployUrl: options.url,
            telemetry,
            recentStatuses: samples.map((item) => item.status ?? "network-error"),
          },
        }),
      );
    }
  };

  void tick();
  const timer = setInterval(tick, options.intervalMs);

  return () => {
    disposed = true;
    clearInterval(timer);
  };
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}
