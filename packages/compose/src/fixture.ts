import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ComponentGraph } from '@forge/shared/component';
import type { ScoreResult, Task } from '@forge/shared/task';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactRoot = path.join(packageRoot, 'fixtures', 'artifacts');

export function createFixtureGraph(): ComponentGraph {
  return {
    components: [
      {
        id: 'renderer',
        goal: 'Render the selected 3D model to a canvas.',
        contract: { entry: 'mountRenderer(canvas, modelUrl)' },
        strategy: 'assign'
      },
      {
        id: 'model',
        goal: 'Produce an interchangeable GLB model asset.',
        contract: { produces: ['dist/model.glb'] },
        strategy: 'race',
        variants: 2
      },
      {
        id: 'shell',
        goal: 'Provide the page shell that hosts the canvas and consumes the model.',
        contract: { consumes: ['model.glb'], entry: 'index.html with <canvas id="scene">' },
        strategy: 'assign'
      }
    ],
    candidates: [
      {
        componentId: 'renderer',
        variantId: 'renderer:0',
        worktree: path.join(artifactRoot, 'renderer'),
        artifactPath: path.join(artifactRoot, 'renderer', 'renderer.mjs'),
        steps: [],
        score: score(0.91, 0.92)
      },
      {
        componentId: 'model',
        variantId: 'model:blender',
        worktree: path.join(artifactRoot, 'model-blender'),
        artifactPath: path.join(artifactRoot, 'model-blender'),
        steps: [],
        score: score(0.96, 0.97)
      },
      {
        componentId: 'model',
        variantId: 'model:online',
        worktree: path.join(artifactRoot, 'model-online'),
        artifactPath: path.join(artifactRoot, 'model-online'),
        steps: [],
        score: score(0.71, 0.78)
      },
      {
        componentId: 'shell',
        variantId: 'shell:0',
        worktree: path.join(artifactRoot, 'shell'),
        artifactPath: path.join(artifactRoot, 'shell'),
        steps: [],
        score: score(0.89, 0.9)
      }
    ]
  };
}

export function createFixtureTask(): Task {
  const now = Date.now();

  return {
    id: `compose-fixture-${now}`,
    origin: 'human',
    mode: 'compose',
    intent: 'Build me a 3D model website.',
    context: {
      integrationRoot: path.join(packageRoot, '.local-compose', `fixture-${now}`)
    },
    steps: [],
    verdict: 'running',
    createdAt: now,
    updatedAt: now
  };
}

function score(overall: number, taskCompletion: number): ScoreResult {
  return {
    rubricPass: true,
    planAdherence: overall,
    toolCorrectness: overall,
    taskCompletion,
    overall,
    notes: 'fixture score'
  };
}
