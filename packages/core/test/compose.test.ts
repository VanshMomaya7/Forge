import { execFile } from 'node:child_process';
import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import type { Task } from '@forge/shared/task';
import { selectBest } from '@forge/compose';
import { afterEach, describe, expect, it } from 'vitest';

import { buildComponents } from '../src/build-components.js';
import { decompose } from '../src/decompose.js';
import { runTask } from '../src/router.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const execFileAsync = promisify(execFile);
const testWorktreeRoots = new Set<string>();
let taskSequence = 0;

describe('compose stubs', () => {
  afterEach(async () => {
    for (const root of testWorktreeRoots) {
      await removeRegisteredWorktrees(root);
      await rm(root, { recursive: true, force: true });
    }
    testWorktreeRoots.clear();
  });

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
    expect(new Set(graph.candidates.map((candidate) => candidate.worktree))).toHaveLength(4);
    expect(graph.candidates.every((candidate) => candidate.steps.length === 1)).toBe(true);
    expect(graph.candidates.every((candidate) => candidate.score?.overall)).toBe(true);
    const model = graph.candidates.find((candidate) => candidate.variantId === 'model:blender');
    expect(model?.artifactPath).toBe(model?.worktree);
    await expect(access(path.join(model!.worktree, 'dist', 'model.glb'))).resolves.toBeUndefined();
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
  taskSequence += 1;
  const id = `compose-task-${taskSequence}`;
  const worktreeRoot = path.join(repoRoot, 'forge-worktrees-test', id);
  testWorktreeRoots.add(worktreeRoot);

  return {
    id,
    origin: 'human',
    intent: 'build me a 3D model website',
    context: {
      repo: repoRoot,
      worktreeRoot,
      integrationRoot: path.join(worktreeRoot, 'integration'),
      maxSteps: 1
    },
    mode: 'compose',
    steps: [],
    verdict: 'running',
    createdAt: 1,
    updatedAt: 1
  };
}

async function removeRegisteredWorktrees(root: string): Promise<void> {
  const { stdout } = await execFileAsync('git', [
    '-c',
    `safe.directory=${repoRoot.replace(/\\/g, '/')}`,
    '-C',
    repoRoot,
    'worktree',
    'list',
    '--porcelain'
  ]);
  const worktrees = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .filter((worktree) => path.resolve(worktree).startsWith(path.resolve(root)));

  for (const worktree of worktrees) {
    await execFileAsync('git', [
      '-c',
      `safe.directory=${repoRoot.replace(/\\/g, '/')}`,
      '-C',
      repoRoot,
      'worktree',
      'remove',
      '--force',
      worktree
    ]);
  }
}
