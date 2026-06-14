import path from 'node:path';

import type { ComponentCandidate, ComponentGraph } from '@forge/shared/component';
import type { ScoreResult, Task } from '@forge/shared/task';

export function selectBest(graph: ComponentGraph): ComponentCandidate[] {
  return graph.components.flatMap((component) => {
    const candidates = graph.candidates.filter((candidate) => candidate.componentId === component.id);
    const best = candidates.reduce<ComponentCandidate | undefined>((currentBest, candidate) => {
      if (!currentBest || candidateScore(candidate) > candidateScore(currentBest)) {
        return candidate;
      }

      return currentBest;
    }, undefined);

    return best ? [best] : [];
  });
}

export async function integrate(
  _selected: ComponentCandidate[],
  _graph: ComponentGraph,
  task: Task
): Promise<{ artifactPath: string }> {
  void _selected;
  void _graph;

  return {
    artifactPath: path.join(resolveArtifactRoot(task), 'integrated-site')
  };
}

export async function integrationGate(
  artifactPath: string,
  _task: Task
): Promise<{ gate: ScoreResult; passed: boolean }> {
  void _task;

  return {
    gate: {
      rubricPass: true,
      planAdherence: 0.88,
      toolCorrectness: 0.88,
      taskCompletion: 0.88,
      overall: 0.88,
      notes: `Stub integration gate passed for ${artifactPath}.`
    },
    passed: true
  };
}

function candidateScore(candidate: ComponentCandidate): number {
  return candidate.score?.overall ?? 0;
}

function resolveArtifactRoot(task: Task): string {
  if (typeof task.context.artifactRoot === 'string') {
    return path.resolve(task.context.artifactRoot);
  }

  if (typeof task.context.repo === 'string') {
    return path.resolve(task.context.repo, 'forge-worktrees', task.id, 'compose');
  }

  return path.resolve(process.cwd(), 'forge-worktrees', task.id, 'compose');
}
