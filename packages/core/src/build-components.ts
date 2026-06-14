import path from 'node:path';

import type {
  ComponentCandidate,
  ComponentGraph,
  ComponentSpec
} from '@forge/shared/component';
import type { ScoreResult, Step, Task } from '@forge/shared/task';

export async function buildComponents(graph: ComponentGraph, task: Task): Promise<ComponentGraph> {
  const candidates = graph.components.flatMap((component) =>
    component.strategy === 'race'
      ? buildRaceCandidates(component, task)
      : [buildAssignCandidate(component, task)]
  );

  return {
    components: graph.components,
    candidates
  };
}

function buildAssignCandidate(component: ComponentSpec, task: Task): ComponentCandidate {
  return makeCandidate(component, task, `${component.id}:0`, 0.82);
}

function buildRaceCandidates(component: ComponentSpec, task: Task): ComponentCandidate[] {
  const variants = Math.max(1, component.variants ?? 2);
  const variantNames = component.id === 'model' ? ['blender', 'online'] : [];

  return Array.from({ length: variants }, (_, index) => {
    const strategy = variantNames[index] ?? `variant-${index + 1}`;
    const score = index === 0 ? 0.91 : 0.84;
    return makeCandidate(component, task, `${component.id}:${strategy}`, score);
  });
}

function makeCandidate(
  component: ComponentSpec,
  task: Task,
  variantId: string,
  overall: number
): ComponentCandidate {
  const now = Date.now();
  const worktree = path.join(resolveWorktreeRoot(task), sanitizePathSegment(variantId));
  const score = makeScore(overall, `Stub score for ${variantId}.`);
  const step: Step = {
    id: `${task.id}:${variantId}:stub-step-1`,
    agentId: `component-${sanitizePathSegment(variantId)}`,
    action: 'stub-build-component',
    output: `Stubbed ${component.id} candidate ${variantId} for contract ${JSON.stringify(
      component.contract
    )}.`,
    scores: score,
    verdict: 'pass',
    ts: now
  };

  return {
    componentId: component.id,
    variantId,
    worktree,
    steps: [step],
    score,
    artifactPath: artifactPath(component, worktree)
  };
}

function makeScore(overall: number, notes: string): ScoreResult {
  return {
    rubricPass: true,
    planAdherence: overall,
    toolCorrectness: overall,
    taskCompletion: overall,
    overall,
    notes
  };
}

function artifactPath(component: ComponentSpec, worktree: string): string {
  const produced = component.contract.produces?.[0];
  if (produced) {
    return path.join(worktree, produced);
  }

  return path.join(worktree, 'dist', `${component.id}-artifact`);
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

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 96);
}
