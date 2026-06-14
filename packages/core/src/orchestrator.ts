import { execFile, execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { AgentConfig, ForkAndRun, Promote } from '@forge/shared/contracts';
import type { ScoreResult, Step, Task, Verdict } from '@forge/shared/task';

import { emitTaskUpdated } from './event-bus.js';
import { runAgent } from './run-agent.js';
import { upsert } from './store.js';

const execFileAsync = promisify(execFile);
const evalsPackage = '@forge/evals';

type Gate = (score: ScoreResult | undefined) => Verdict;
type EvalsModule = {
  gate?: Gate;
};

let cachedGate: Gate | undefined;

export const forkAndRun: ForkAndRun = async (task, n) => {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('forkAndRun requires at least one child agent');
  }

  const repoRoot = resolveRepoRoot(task);
  const worktreeRoot = resolveWorktreeRoot(task, repoRoot);
  await mkdir(worktreeRoot, { recursive: true });

  const children: Task[] = [];
  for (let index = 0; index < n; index += 1) {
    const child = createChildTask(task, index, worktreeRoot, repoRoot);
    await addWorktree(repoRoot, child.context.worktree as string);
    upsert(child);
    children.push(child);
  }

  await Promise.all(children.map((child) => runChild(child)));

  promote(children);
  for (const child of children) {
    upsert(child);
    emitTaskUpdated(child);
  }

  return children;
};

export const promote: Promote = (children) => {
  if (children.length === 0) {
    throw new Error('promote requires at least one child task');
  }

  const eligible = children.filter((child) => !hasBlockedStep(child));
  const winner = eligible.reduce<Task | undefined>((best, child) => {
    if (!best || taskScore(child) > taskScore(best)) {
      return child;
    }

    return best;
  }, undefined);

  if (!winner) {
    throw new Error('No promotable child tasks without a blocked step');
  }

  const now = Date.now();
  for (const child of children) {
    child.verdict = child.id === winner.id ? 'won' : 'lost';
    child.updatedAt = now;

    if (child.id !== winner.id) {
      removeWorktree(child);
    }
  }

  return winner;
};

async function runChild(child: Task): Promise<void> {
  const gate = await resolveGate();
  const cfg: AgentConfig = {
    worktree: child.context.worktree as string
  };

  if (typeof child.context.model === 'string') {
    cfg.model = child.context.model;
  }

  if (typeof child.context.maxSteps === 'number') {
    cfg.maxSteps = child.context.maxSteps;
  }

  const iterator = runAgent(child, cfg)[Symbol.asyncIterator]();

  while (true) {
    const next = await iterator.next();
    if (next.done) {
      return;
    }

    const gatedStep = applyGate(next.value, gate);
    child.steps.push(gatedStep);
    child.updatedAt = Date.now();

    if (gatedStep.scores) {
      child.scores = gatedStep.scores;
    }

    if (gatedStep.verdict === 'block') {
      child.verdict = 'blocked';
    }

    upsert(child);
    emitTaskUpdated(child);

    if (gatedStep.verdict === 'block') {
      await iterator.return?.();
      return;
    }
  }
}

function applyGate(step: Step, gate: Gate): Step {
  const verdict = gate(step.scores);
  return { ...step, verdict };
}

async function resolveGate(): Promise<Gate> {
  if (cachedGate) {
    return cachedGate;
  }

  try {
    const evals = (await import(evalsPackage)) as EvalsModule;
    cachedGate = typeof evals.gate === 'function' ? evals.gate : fallbackGate;
  } catch {
    cachedGate = fallbackGate;
  }

  return cachedGate;
}

function fallbackGate(): Verdict {
  return 'pass';
}

function createChildTask(
  task: Task,
  index: number,
  worktreeRoot: string,
  repoRoot: string
): Task {
  const now = Date.now();
  const id = `${task.id}-child-${index + 1}`;
  const worktree = path.join(worktreeRoot, sanitizePathSegment(id));

  const child: Task = {
    id,
    parentId: task.id,
    origin: 'subtask',
    intent: task.intent,
    context: {
      ...task.context,
      agentIndex: index,
      repo: repoRoot,
      worktree
    },
    steps: [],
    verdict: 'running',
    createdAt: now,
    updatedAt: now
  };

  if (task.plan) {
    child.plan = task.plan;
  }

  return child;
}

function resolveRepoRoot(task: Task): string {
  return typeof task.context.repo === 'string'
    ? path.resolve(task.context.repo)
    : process.cwd();
}

function resolveWorktreeRoot(task: Task, repoRoot: string): string {
  return typeof task.context.worktreeRoot === 'string'
    ? path.resolve(task.context.worktreeRoot)
    : path.resolve(repoRoot, '..', 'forge-worktrees');
}

async function addWorktree(repoRoot: string, worktree: string): Promise<void> {
  await execGit(repoRoot, ['worktree', 'add', '--detach', worktree, 'HEAD']);
}

async function execGit(repoRoot: string, args: string[]): Promise<void> {
  await execFileAsync('git', [
    '-c',
    `safe.directory=${safeDirectory(repoRoot)}`,
    '-C',
    repoRoot,
    ...args
  ]);
}

function removeWorktree(task: Task): void {
  if (typeof task.context.worktree !== 'string' || typeof task.context.repo !== 'string') {
    return;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      execFileSync(
        'git',
        [
          '-c',
          `safe.directory=${safeDirectory(path.resolve(task.context.repo))}`,
          '-C',
          path.resolve(task.context.repo),
          'worktree',
          'remove',
          '--force',
          task.context.worktree
        ],
        { stdio: 'ignore' }
      );
      return;
    } catch (error) {
      if (attempt === 2) {
        task.context.worktreeRemovalError = error instanceof Error ? error.message : String(error);
        return;
      }

      sleepSync(100);
    }
  }
}

function hasBlockedStep(task: Task): boolean {
  return task.steps.some((step) => step.verdict === 'block');
}

function taskScore(task: Task): number {
  if (task.scores) {
    return task.scores.overall;
  }

  const stepScores = task.steps
    .map((step) => step.scores?.overall)
    .filter((score): score is number => typeof score === 'number');

  return stepScores.length > 0 ? Math.max(...stepScores) : 0;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 96);
}

function safeDirectory(repoRoot: string): string {
  return repoRoot.replace(/\\/g, '/');
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
