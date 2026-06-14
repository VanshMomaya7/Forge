import type { ComponentCandidate, ComponentGraph } from '@forge/shared/component';

export function selectBest(graph: ComponentGraph): ComponentCandidate[] {
  const selected: ComponentCandidate[] = [];

  for (const component of graph.components) {
    const best = graph.candidates
      .filter((candidate) => candidate.componentId === component.id)
      .reduce<ComponentCandidate | undefined>((current, candidate) => {
        if (!current) {
          return candidate;
        }

        return compareCandidates(candidate, current) > 0 ? candidate : current;
      }, undefined);

    if (best) {
      selected.push(best);
    }
  }

  return selected;
}

function compareCandidates(left: ComponentCandidate, right: ComponentCandidate): number {
  const overallDelta = scoreValue(left.score?.overall) - scoreValue(right.score?.overall);
  if (overallDelta !== 0) {
    return overallDelta;
  }

  const completionDelta =
    scoreValue(left.score?.taskCompletion) - scoreValue(right.score?.taskCompletion);
  if (completionDelta !== 0) {
    return completionDelta;
  }

  return right.variantId.localeCompare(left.variantId);
}

function scoreValue(value: number | undefined): number {
  return value ?? Number.NEGATIVE_INFINITY;
}
