import type { Task } from '@forge/shared/task';

import { buildComponents } from './build-components.js';
import { integrate, integrationGate, selectBest } from './compose-back-half.js';
import { decompose } from './decompose.js';
import { emitTaskUpdated } from './event-bus.js';
import { forkAndRun } from './orchestrator.js';
import { upsert } from './store.js';

export interface RunTaskOptions {
  raceVariants?: number;
}

export async function runTask(task: Task, options: RunTaskOptions = {}): Promise<Task> {
  if (task.mode === 'race') {
    return runRaceTask(task, options.raceVariants ?? 3);
  }

  return runComposeTask(task);
}

async function runRaceTask(task: Task, variants: number): Promise<Task> {
  const children = await forkAndRun(task, variants);
  const winner = children.find((child) => child.verdict === 'won');

  task.verdict = winner ? 'won' : 'blocked';
  if (winner?.scores) {
    task.scores = winner.scores;
  }
  if (winner?.artifact) {
    task.artifact = winner.artifact;
  }
  task.updatedAt = Date.now();
  upsert(task);
  emitTaskUpdated(task);

  return task;
}

async function runComposeTask(task: Task): Promise<Task> {
  task.graph = await decompose(task);
  publish(task);

  task.graph = await buildComponents(task.graph, task);
  publish(task);

  task.selected = selectBest(task.graph);
  publish(task);

  const integration = await integrate(task.selected, task.graph, task);
  const gated = await integrationGate(integration.artifactPath, task);
  task.integration = {
    artifactPath: integration.artifactPath,
    gate: gated.gate,
    passed: gated.passed
  };
  task.verdict = gated.passed ? 'shipped' : 'blocked';
  publish(task);

  return task;
}

function publish(task: Task): void {
  task.updatedAt = Date.now();
  upsert(task);
  emitTaskUpdated(task);
}
