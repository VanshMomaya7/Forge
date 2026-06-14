import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Task } from '@forge/shared/task';

import { startEventBusServer, subscribe } from './event-bus.js';
import { forkAndRun } from './orchestrator.js';

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const taskId = `demo-${Date.now()}`;
  const task: Task = {
    id: taskId,
    origin: 'human',
    intent: 'Demo Forge by streaming three stub Codex agents and promoting one winner.',
    context: {
      repo: repoRoot,
      worktreeRoot: path.join(repoRoot, 'forge-worktrees', taskId)
    },
    steps: [],
    verdict: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const bus = await startEventBusServer();
  const unsubscribe = subscribe((event) => {
    const latest = event.task.steps.at(-1);
    const suffix = latest ? ` step=${latest.action} verdict=${latest.verdict ?? 'pending'}` : '';
    console.log(`task.updated id=${event.task.id} status=${event.task.verdict}${suffix}`);
  });

  console.log(`Forge event bus listening at ${bus.url}`);
  console.log(`Running forkAndRun(${task.id}, 3)`);

  try {
    const children = await forkAndRun(task, 3);
    const winner = children.find((child) => child.verdict === 'won');

    if (!winner) {
      throw new Error('No winner was promoted');
    }

    console.log(`winner=${winner.id} worktree=${winner.context.worktree as string}`);

    if (process.env.FORGE_KEEP_DEMO_WORKTREE !== '1') {
      await removeWorktree(repoRoot, winner.context.worktree as string);
      console.log('demo winner worktree removed; set FORGE_KEEP_DEMO_WORKTREE=1 to keep it');
    }
  } finally {
    unsubscribe();
    await bus.stop();
  }
}

async function removeWorktree(repoRoot: string, worktree: string): Promise<void> {
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

await main();
