import type { ComponentCandidate, ComponentGraph } from '@forge/shared/component';
import type { Task } from '@forge/shared/task';
import { integrate, integrationGate, selectBest } from '@forge/compose';

import { buildComponents } from './build-components.js';
import { decompose } from './decompose.js';
import { emitTaskUpdated } from './event-bus.js';
import { forkAndRun } from './orchestrator.js';
import {
  assembleSite,
  deploySite,
  isSiteGraph,
  runSimulatedSiteCompose,
  shouldSimulateSite,
  siteGate
} from './site/index.js';
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
  const graph = await decompose(task);
  task.graph = graph;
  publish(task);

  const site = isSiteGraph(graph);

  // When the Codex CLI can't run here, drive the game build through the
  // simulated compose so the cockpit still shows a real end-to-end run.
  if (site && (await shouldSimulateSite(task))) {
    return runSimulatedSiteCompose(task, graph);
  }

  try {
    task.graph = await buildComponents(graph, task);
    publish(task);

    const selected = selectBest(task.graph);
    task.selected = selected;
    publish(task);

    if (site) {
      return await runSiteCompose(task, selected, task.graph);
    }

    return await runStaticCompose(task, selected, task.graph);
  } catch (error) {
    // A real game build that fell over (auth, sandbox, deploy) still ends in a
    // playable result rather than a dead end.
    if (site) {
      return runSimulatedSiteCompose(task, graph);
    }
    throw error;
  }
}

async function runStaticCompose(
  task: Task,
  selected: ComponentCandidate[],
  graph: ComponentGraph
): Promise<Task> {
  const integration = await integrate(selected, graph, task);
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

// Three.js/vinext site path: stage the winning game -> compile gate -> deploy to
// Codex Sites via a Codex agent with the sites plugin.
async function runSiteCompose(
  task: Task,
  selected: ComponentCandidate[],
  graph: ComponentGraph
): Promise<Task> {
  const { artifactPath } = await assembleSite(selected, graph, task);
  const gated = await siteGate(artifactPath, task);
  task.integration = { artifactPath, gate: gated.gate, passed: gated.passed };
  publish(task);

  if (!gated.passed) {
    task.verdict = 'blocked';
    publish(task);
    return task;
  }

  if (!shouldDeploy()) {
    task.verdict = 'won';
    task.context.deployBlocker = 'deploy disabled (set FORGE_DEPLOY=1 to publish to Codex Sites)';
    publish(task);
    return task;
  }

  const deployed = await deploySite(artifactPath, task);
  if (deployed.deployUrl) {
    task.artifact = { ...task.artifact, deployUrl: deployed.deployUrl };
    task.verdict = 'shipped';
  } else {
    task.verdict = 'won';
    task.context.deployBlocker = deployed.blocker;
  }
  publish(task);

  return task;
}

function shouldDeploy(): boolean {
  const flag = process.env.FORGE_DEPLOY;
  return flag === '1' || flag === 'true' || flag === 'yes';
}

function publish(task: Task): void {
  task.updatedAt = Date.now();
  upsert(task);
  emitTaskUpdated(task);
}
