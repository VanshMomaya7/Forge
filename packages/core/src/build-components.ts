import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  ComponentCandidate,
  ComponentGraph,
  ComponentSpec
} from '@forge/shared/component';
import type { AgentConfig } from '@forge/shared/contracts';
import type { ScoreResult, Step, Task, Verdict } from '@forge/shared/task';

import { emitTaskUpdated } from './event-bus.js';
import { runAgent } from './run-agent.js';
import { upsert } from './store.js';

const execFileAsync = promisify(execFile);
const evalsPackage = '@forge/evals';

type Rubric = {
  id: string;
  criteria: string[];
  weights: number[];
};

type EvalsModule = {
  generateRubric?: (context: Task['context']) => Promise<Rubric>;
  score?: (task: Task, step: Step, rubric: Rubric) => Promise<ScoreResult>;
  gate?: (score: ScoreResult) => Verdict;
};

type CandidatePlan = {
  component: ComponentSpec;
  candidate: ComponentCandidate;
};

export async function buildComponents(graph: ComponentGraph, task: Task): Promise<ComponentGraph> {
  const candidates = createCandidatePlans(graph.components, task);
  const populatedGraph: ComponentGraph = {
    components: graph.components,
    candidates: candidates.map((candidate) => candidate.candidate)
  };
  task.graph = populatedGraph;

  const repoRoot = resolveRepoRoot(task);
  await createWorktrees(repoRoot, candidates.map(({ candidate }) => candidate.worktree));

  const restoreGitEnv = configureGitSafeDirectories([
    repoRoot,
    ...candidates.map(({ candidate }) => candidate.worktree)
  ]);

  try {
    const evals = await resolveEvals();
    const rubric = await resolveRubric(evals, task);
    await Promise.all(
      candidates.map(({ component, candidate }) =>
        runCandidate(component, candidate, task, populatedGraph, evals, rubric)
      )
    );
  } finally {
    restoreGitEnv();
  }

  return populatedGraph;
}

function createCandidatePlans(components: ComponentSpec[], task: Task): CandidatePlan[] {
  return components.flatMap((component) =>
    variantIds(component).map((variantId) => ({
      component,
      candidate: {
        componentId: component.id,
        variantId,
        worktree: path.join(resolveWorktreeRoot(task), sanitizePathSegment(variantId)),
        steps: [],
        artifactPath: artifactPath(component, path.join(resolveWorktreeRoot(task), sanitizePathSegment(variantId)))
      }
    }))
  );
}

function variantIds(component: ComponentSpec): string[] {
  if (component.strategy === 'assign') {
    return [`${component.id}:0`];
  }

  const variants = Math.max(1, Math.trunc(component.variants ?? 2));
  const names = defaultVariantNames(component.id, variants);

  return names.map((name) => `${component.id}:${name}`);
}

function defaultVariantNames(componentId: string, count: number): string[] {
  const defaults = componentId === 'model' ? ['blender', 'online'] : [];

  return Array.from({ length: count }, (_, index) => defaults[index] ?? `variant-${index + 1}`);
}

async function createWorktrees(repoRoot: string, worktrees: string[]): Promise<void> {
  for (const worktree of worktrees) {
    await mkdir(path.dirname(worktree), { recursive: true });
    await execGit(repoRoot, ['worktree', 'add', '--detach', worktree, 'HEAD']);
  }
}

async function runCandidate(
  component: ComponentSpec,
  candidate: ComponentCandidate,
  task: Task,
  graph: ComponentGraph,
  evals: EvalsModule,
  rubric: Rubric
): Promise<void> {
  const candidateTask = candidateTaskFor(task, component, candidate);
  const cfg: AgentConfig = { worktree: candidate.worktree };
  const stepLimit = maxSteps(task);
  if (stepLimit !== undefined) {
    cfg.maxSteps = stepLimit;
  }
  const iterator = runAgent(candidateTask, cfg)[Symbol.asyncIterator]();

  while (true) {
    const next = await iterator.next();
    if (next.done) {
      candidate.score = aggregateCandidateScore(candidate);
      publish(task, graph);
      return;
    }

    const scoredStep = await scoreStep(evals, candidateTask, next.value, rubric);
    candidate.steps.push(scoredStep);
    candidate.score = aggregateCandidateScore(candidate);
    candidateTask.steps.push(scoredStep);
    candidateTask.updatedAt = Date.now();
    publish(task, graph);

    if (scoredStep.verdict === 'block') {
      await iterator.return?.();
      return;
    }
  }
}

async function scoreStep(
  evals: EvalsModule,
  task: Task,
  step: Step,
  rubric: Rubric
): Promise<Step> {
  const score = evals.score ? await evals.score(task, step, rubric) : fallbackScore(step);
  const verdict = evals.gate ? evals.gate(score) : fallbackGate(score);

  return {
    ...step,
    scores: score,
    verdict
  };
}

function candidateTaskFor(task: Task, component: ComponentSpec, candidate: ComponentCandidate): Task {
  const now = Date.now();
  return {
    id: `${task.id}:${sanitizePathSegment(candidate.variantId)}`,
    parentId: task.id,
    origin: 'subtask',
    intent: componentPrompt(task, component, candidate.variantId),
    context: {
      ...task.context,
      componentId: component.id,
      componentGoal: component.goal,
      componentContract: component.contract,
      buildStrategy: component.strategy,
      variantId: candidate.variantId,
      repo: resolveRepoRoot(task),
      worktree: candidate.worktree
    },
    mode: task.mode,
    plan: [
      component.goal,
      `Honor interface contract: ${JSON.stringify(component.contract)}`,
      'Report the artifact path produced for this component.'
    ],
    steps: [],
    verdict: 'running',
    createdAt: now,
    updatedAt: now
  };
}

function componentPrompt(task: Task, component: ComponentSpec, variantId: string): string {
  return [
    `Build Forge component "${component.id}" for parent intent: ${task.intent}`,
    '',
    `Component goal: ${component.goal}`,
    `Interface contract: ${JSON.stringify(component.contract)}`,
    `Build strategy: ${component.strategy}`,
    `Variant: ${variantId}`,
    '',
    'Only change files needed for this component. The candidate is swappable only if it honors the contract exactly.'
  ].join('\n');
}

function aggregateCandidateScore(candidate: ComponentCandidate): ScoreResult {
  const scores = candidate.steps
    .map((step) => step.scores)
    .filter((score): score is ScoreResult => score !== undefined);

  if (scores.length === 0) {
    return fallbackScore({ output: 'No scored steps were produced.' } as Step);
  }

  const average = (field: keyof Pick<
    ScoreResult,
    'planAdherence' | 'toolCorrectness' | 'taskCompletion' | 'overall'
  >): number =>
    roundScore(scores.reduce((sum, score) => sum + score[field], 0) / scores.length);
  const overall = average('overall');
  const result: ScoreResult = {
    rubricPass: scores.every((score) => score.rubricPass) && overall >= 0.7,
    planAdherence: average('planAdherence'),
    toolCorrectness: average('toolCorrectness'),
    taskCompletion: average('taskCompletion'),
    overall
  };
  const notes = scores.map((score) => score.notes).filter((note): note is string => Boolean(note));

  if (notes.length > 0) {
    result.notes = notes[notes.length - 1]!;
  }

  return result;
}

async function resolveEvals(): Promise<EvalsModule> {
  try {
    return (await import(evalsPackage)) as EvalsModule;
  } catch {
    return {};
  }
}

async function resolveRubric(evals: EvalsModule, task: Task): Promise<Rubric> {
  if (evals.generateRubric) {
    return evals.generateRubric({ ...task.context, intent: task.intent });
  }

  return {
    id: 'forge-component-fallback',
    criteria: ['honors the component contract', 'uses correct tools', 'completes the component'],
    weights: [0.4, 0.2, 0.4]
  };
}

function fallbackScore(step: Step): ScoreResult {
  const text = `${step.action}\n${step.output}`.toLowerCase();
  const incomplete = text.includes('todo') || text.includes('not implemented') || text.includes('error');
  const overall = incomplete ? 0.42 : 0.78;

  return {
    rubricPass: overall >= 0.7,
    planAdherence: overall,
    toolCorrectness: overall,
    taskCompletion: overall,
    overall,
    notes: incomplete
      ? 'Fallback component scorer blocked incomplete output.'
      : 'Fallback component scorer passed streamed output.'
  };
}

function fallbackGate(score: ScoreResult): Verdict {
  return score.rubricPass && score.overall >= 0.7 ? 'pass' : 'block';
}

function artifactPath(component: ComponentSpec, worktree: string): string {
  const produced = component.contract.produces?.[0];
  if (produced) {
    return path.join(worktree, produced);
  }

  if (component.contract.entry && component.contract.entry.includes('.html')) {
    return path.join(worktree, 'index.html');
  }

  return path.join(worktree, 'dist', `${component.id}-artifact`);
}

function maxSteps(task: Task): number | undefined {
  return typeof task.context.maxSteps === 'number' ? task.context.maxSteps : undefined;
}

function publish(task: Task, graph: ComponentGraph): void {
  task.graph = graph;
  task.updatedAt = Date.now();
  upsert(task);
  emitTaskUpdated(task);
}

function resolveRepoRoot(task: Task): string {
  return typeof task.context.repo === 'string' ? path.resolve(task.context.repo) : process.cwd();
}

function resolveWorktreeRoot(task: Task): string {
  if (typeof task.context.worktreeRoot === 'string') {
    return path.resolve(task.context.worktreeRoot, 'components');
  }

  if (typeof task.context.repo === 'string') {
    return path.resolve(task.context.repo, 'forge-worktrees', task.id, 'components');
  }

  return path.resolve(process.cwd(), 'forge-worktrees', task.id, 'components');
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

function configureGitSafeDirectories(paths: string[]): () => void {
  const previousCount = process.env.GIT_CONFIG_COUNT;
  const previousPairs = new Map<string, string | undefined>();
  const safePaths = Array.from(new Set(paths.map((value) => safeDirectory(path.resolve(value)))));
  const startIndex = Number.parseInt(previousCount ?? '0', 10);
  const offset = Number.isFinite(startIndex) && startIndex > 0 ? startIndex : 0;

  process.env.GIT_CONFIG_COUNT = String(offset + safePaths.length);

  safePaths.forEach((safePath, index) => {
    const keyName = `GIT_CONFIG_KEY_${offset + index}`;
    const valueName = `GIT_CONFIG_VALUE_${offset + index}`;
    previousPairs.set(keyName, process.env[keyName]);
    previousPairs.set(valueName, process.env[valueName]);
    process.env[keyName] = 'safe.directory';
    process.env[valueName] = safePath;
  });

  return () => {
    if (previousCount === undefined) {
      delete process.env.GIT_CONFIG_COUNT;
    } else {
      process.env.GIT_CONFIG_COUNT = previousCount;
    }

    for (const [key, value] of previousPairs) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function safeDirectory(repoRoot: string): string {
  return repoRoot.replace(/\\/g, '/');
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 96);
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}
