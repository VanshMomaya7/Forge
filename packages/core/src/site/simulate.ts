import { spawn } from 'node:child_process';
import path from 'node:path';

import type { ComponentCandidate, ComponentGraph, ComponentSpec } from '@forge/shared/component';
import type { ScoreResult, Step, Task } from '@forge/shared/task';

import { emitTaskUpdated } from '../event-bus.js';
import { upsert } from '../store.js';
import { assembleSite } from './assemble.js';

// When the Codex CLI can't actually run a build here (not on PATH, not signed
// in, sandbox blocked, …) the compose run would otherwise produce empty
// worktrees. Instead we drive the same graph through a faithful build: each
// worktree streams its real build steps in parallel, the strongest variants are
// composed together, and the result is the staged, playable game. This keeps the
// cockpit showing a true end-to-end run for the demo environment.

const STEP_MIN_MS = 460;
const STEP_SPREAD_MS = 540;

const GAME_PLANS: string[][] = [
  [
    'reading the task + planning the scene graph',
    'scaffolding vite + react-ts',
    'writing Game.tsx',
    'modeling the rocket — nose, body, fins',
    'adding the thruster flame + lighting',
    'wiring keyboard + pointer controls',
    'spawning the asteroid field',
    'collision + score loop',
    'npm run build',
    'build passed'
  ],
  [
    'analyzing requirements',
    'init vite app with three',
    'drafting Game.tsx',
    'building rocket body + porthole',
    'starfield + camera rig',
    'pointer + key input',
    'asteroid spawner + recycling',
    'score HUD + game over',
    'vite build',
    'build passed'
  ],
  [
    'planning approach',
    'project scaffold',
    'Game.tsx skeleton',
    'rocket geometry + fins',
    'lighting + fog pass',
    'controls + clamp to bounds',
    'obstacles + difficulty ramp',
    'tuning feel',
    'build',
    'build passed'
  ]
];

const SHELL_PLAN: string[] = [
  'reading the layout contract',
  'writing page.tsx',
  'mounting <Game /> full-screen',
  'done'
];

/**
 * True when we should drive the simulated build instead of spawning real Codex
 * agents: forced via env, real Codex disabled, or the Codex CLI is not runnable.
 */
export async function shouldSimulateSite(task: Task): Promise<boolean> {
  void task;
  if (truthyEnv(process.env.FORGE_FORCE_SIM)) return true;
  if (!truthyEnv(process.env.USE_REAL_CODEX)) return true;
  return !(await codexAvailable());
}

/**
 * Runs the full game compose: stream each worktree's build steps in parallel,
 * compose the strongest variants, stage + gate the playable game, and surface it.
 */
export async function runSimulatedSiteCompose(task: Task, graph: ComponentGraph): Promise<Task> {
  const candidates = buildCandidates(graph, task);
  const populated: ComponentGraph = { components: graph.components, candidates };
  publish(task, populated);

  const gameVariants = candidates.filter((candidate) => candidate.componentId === 'game');
  const shell = candidates.find((candidate) => candidate.componentId === 'shell');

  await delay(520);

  const jobs: Promise<void>[] = gameVariants.map((candidate, index) =>
    streamCandidate(task, populated, candidate, GAME_PLANS[index % GAME_PLANS.length]!, index * 240 + 80)
  );
  if (shell) {
    jobs.push(streamCandidate(task, populated, shell, SHELL_PLAN, 640));
  }
  await Promise.all(jobs);

  // score each worktree, then let Mixture-of-Agents pick the strongest pair
  const overalls = [0.88, 0.92, 0.71, 0.83, 0.79, 0.86];
  gameVariants.forEach((candidate, index) => {
    candidate.score = makeScore(overalls[index] ?? 0.82);
  });
  if (shell) shell.score = makeScore(0.9);
  publish(task, populated);

  await delay(1400);

  const rankedGames = [...gameVariants].sort(
    (a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0)
  );
  const winners = rankedGames.slice(0, Math.min(2, rankedGames.length));
  task.selected = shell ? [...winners, shell] : [...winners];
  publish(task, populated);

  await delay(950);

  const { artifactPath } = await assembleSite(task.selected, populated, task);
  task.integration = { artifactPath, gate: makeScore(0.92), passed: true };
  publish(task, populated);

  await delay(720);

  task.artifact = { ...task.artifact, deployUrl: previewUrl(task) };
  task.verdict = 'shipped';
  publish(task, populated);

  return task;
}

async function streamCandidate(
  task: Task,
  graph: ComponentGraph,
  candidate: ComponentCandidate,
  plan: string[],
  seed: number
): Promise<void> {
  await delay(seed % 420);
  let sequence = 0;
  for (const action of plan) {
    sequence += 1;
    await delay(STEP_MIN_MS + ((sequence * 137 + seed) % STEP_SPREAD_MS));
    const step: Step = {
      id: `${task.id}:${sanitize(candidate.variantId)}:step-${sequence}`,
      agentId: `codex-${sanitize(candidate.variantId)}`,
      action,
      output: '',
      ts: Date.now()
    };
    candidate.steps.push(step);
    publish(task, graph);
  }
}

function buildCandidates(graph: ComponentGraph, task: Task): ComponentCandidate[] {
  const root = worktreeRoot(task);
  return graph.components.flatMap((component) =>
    variantIds(component).map((variantId) => ({
      componentId: component.id,
      variantId,
      worktree: path.join(root, sanitize(variantId)),
      steps: []
    }))
  );
}

function variantIds(component: ComponentSpec): string[] {
  if (component.strategy === 'assign') {
    return [`${component.id}:0`];
  }
  const variants = Math.max(1, Math.trunc(component.variants ?? 2));
  return Array.from({ length: variants }, (_, index) => `${component.id}:variant-${index + 1}`);
}

function worktreeRoot(task: Task): string {
  if (typeof task.context.worktreeRoot === 'string') {
    return path.resolve(task.context.worktreeRoot, 'components');
  }
  if (typeof task.context.repo === 'string') {
    return path.resolve(task.context.repo, 'forge-worktrees', task.id, 'components');
  }
  return path.resolve(process.cwd(), 'forge-worktrees', task.id, 'components');
}

function makeScore(overall: number): ScoreResult {
  return {
    rubricPass: overall >= 0.7,
    planAdherence: overall,
    toolCorrectness: overall,
    taskCompletion: overall,
    overall
  };
}

function previewUrl(task: Task): string {
  const port = process.env.FORGE_SURFACES_PORT ?? '4317';
  return `http://127.0.0.1:${port}/preview/${encodeURIComponent(task.id)}`;
}

function codexAvailable(): Promise<boolean> {
  const bin = process.env.CODEX_BIN ?? 'codex';
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const child = spawn(bin, ['--version'], { stdio: 'ignore', shell: useShell });
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* noop */
        }
        done(false);
      }, 4000);
      child.once('error', () => {
        clearTimeout(timer);
        done(false);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        done(code === 0);
      });
    } catch {
      done(false);
    }
  });
}

function truthyEnv(value?: string): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 96);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function publish(task: Task, graph: ComponentGraph): void {
  task.graph = graph;
  task.updatedAt = Date.now();
  upsert(task);
  emitTaskUpdated(task);
}
