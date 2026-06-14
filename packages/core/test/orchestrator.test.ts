import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Task } from '@forge/shared/task';
import { afterEach, describe, expect, it } from 'vitest';

import { forkAndRun, promote } from '../src/orchestrator.js';
import { subscribe } from '../src/event-bus.js';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const testWorktreeRoots = new Set<string>();

describe('orchestrator', () => {
  afterEach(async () => {
    for (const root of testWorktreeRoots) {
      await rm(root, { recursive: true, force: true });
    }
    testWorktreeRoots.clear();
  });

  it('forks three isolated worktrees, streams steps, and promotes one winner', async () => {
    const taskId = `task-${Date.now()}`;
    const worktreeRoot = path.resolve(repoRoot, '..', 'forge-worktrees-test', taskId);
    testWorktreeRoots.add(path.resolve(repoRoot, '..', 'forge-worktrees-test'));
    const updatedTasks: Task[] = [];
    const unsubscribe = subscribe((event) => {
      updatedTasks.push({ ...event.task, steps: [...event.task.steps] });
    });

    try {
      const children = await forkAndRun(makeTask(taskId, worktreeRoot), 3);

      expect(children).toHaveLength(3);
      expect(new Set(children.map((child) => child.context.worktree))).toHaveLength(3);
      expect(children.every((child) => child.parentId === taskId)).toBe(true);
      expect(children.every((child) => child.origin === 'subtask')).toBe(true);
      expect(children.every((child) => child.steps.length === 3)).toBe(true);
      expect(children.flatMap((child) => child.steps).every((step) => step.verdict === 'pass')).toBe(
        true
      );
      expect(children.filter((child) => child.verdict === 'won')).toHaveLength(1);
      expect(children.filter((child) => child.verdict === 'lost')).toHaveLength(2);
      expect(children.find((child) => child.verdict === 'won')?.steps).not.toContainEqual(
        expect.objectContaining({ verdict: 'block' })
      );
      expect(updatedTasks.filter((updated) => updated.steps.length > 0)).toHaveLength(12);

      const winner = children.find((child) => child.verdict === 'won');
      if (winner?.context.worktree) {
        await removeWorktree(winner.context.worktree as string);
      }
    } finally {
      unsubscribe();
    }
  });

  it('promotes the highest-scored unblocked child and marks the rest lost', () => {
    const low = makeTask('low', '', 0.2);
    const blocked = makeTask('blocked', '', 1);
    blocked.steps[0]!.verdict = 'block';
    const high = makeTask('high', '', 0.8);

    const winner = promote([low, blocked, high]);

    expect(winner.id).toBe('high');
    expect(high.verdict).toBe('won');
    expect(low.verdict).toBe('lost');
    expect(blocked.verdict).toBe('lost');
  });
});

function makeTask(id: string, worktreeRoot: string, score?: number): Task {
  const task: Task = {
    id,
    origin: 'human',
    intent: 'Run three Forge agents',
    context: {
      repo: repoRoot,
      worktreeRoot
    },
    mode: 'race',
    steps:
      score === undefined
        ? []
        : [
            {
              id: `${id}-step-1`,
              agentId: id,
              action: 'test-step',
              output: 'test-output',
              scores: {
                rubricPass: true,
                planAdherence: score,
                toolCorrectness: score,
                taskCompletion: score,
                overall: score
              },
              verdict: 'pass',
              ts: 1
            }
          ],
    verdict: 'running',
    createdAt: 1,
    updatedAt: 1
  };

  if (score !== undefined) {
    task.scores = {
      rubricPass: true,
      planAdherence: score,
      toolCorrectness: score,
      taskCompletion: score,
      overall: score
    };
  }

  return task;
}

async function removeWorktree(worktree: string): Promise<void> {
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
