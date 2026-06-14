import path from 'node:path';

import type { Task } from '@forge/shared/task';
import { describe, expect, it } from 'vitest';

import { buildComponents } from '../src/build-components.js';
import { selectBest } from '../src/compose-back-half.js';
import { decompose } from '../src/decompose.js';
import { runTask } from '../src/router.js';

const repoRoot = path.resolve('.');

describe('compose stubs', () => {
  it('decomposes a 3D model website into explicit component contracts', async () => {
    const graph = await decompose(makeTask());

    expect(graph.components).toEqual([
      expect.objectContaining({
        id: 'renderer',
        contract: { entry: 'mountRenderer(canvas, modelUrl)' },
        strategy: 'assign'
      }),
      expect.objectContaining({
        id: 'model',
        contract: { produces: ['dist/model.glb'] },
        strategy: 'race',
        variants: 2
      }),
      expect.objectContaining({
        id: 'shell',
        contract: {
          consumes: ['model.glb'],
          entry: 'index.html with <canvas id="scene">'
        },
        strategy: 'assign'
      })
    ]);
    expect(graph.candidates).toEqual([]);
  });

  it('fills realistic fake component candidates', async () => {
    const task = makeTask();
    const graph = await buildComponents(await decompose(task), task);

    expect(graph.candidates.map((candidate) => candidate.variantId)).toEqual([
      'renderer:0',
      'model:blender',
      'model:online',
      'shell:0'
    ]);
    expect(graph.candidates.every((candidate) => candidate.steps.length === 1)).toBe(true);
    expect(graph.candidates.every((candidate) => candidate.score?.overall)).toBe(true);
    expect(graph.candidates.find((candidate) => candidate.variantId === 'model:blender')?.artifactPath)
      .toContain(path.join('dist', 'model.glb'));
  });

  it('selects the highest scored candidate per component', async () => {
    const task = makeTask();
    const graph = await buildComponents(await decompose(task), task);

    expect(selectBest(graph).map((candidate) => candidate.variantId)).toEqual([
      'renderer:0',
      'model:blender',
      'shell:0'
    ]);
  });

  it('routes compose tasks through decompose, build, select, integrate, and gate', async () => {
    const task = makeTask();

    const result = await runTask(task);

    expect(result.verdict).toBe('shipped');
    expect(result.graph?.components).toHaveLength(3);
    expect(result.graph?.candidates).toHaveLength(4);
    expect(result.selected?.map((candidate) => candidate.componentId)).toEqual([
      'renderer',
      'model',
      'shell'
    ]);
    expect(result.integration).toMatchObject({
      passed: true,
      gate: expect.objectContaining({ rubricPass: true })
    });
  });
});

function makeTask(): Task {
  return {
    id: 'compose-task-1',
    origin: 'human',
    intent: 'build me a 3D model website',
    context: {
      repo: repoRoot,
      worktreeRoot: path.join(repoRoot, 'forge-worktrees-test', 'compose-task-1')
    },
    mode: 'compose',
    steps: [],
    verdict: 'running',
    createdAt: 1,
    updatedAt: 1
  };
}
