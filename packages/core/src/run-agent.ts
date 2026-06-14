import type { RunAgent } from '@forge/shared/contracts';
import type { Step } from '@forge/shared/task';

import { runRealCodexAgent } from './codex-app-server.js';

const DEFAULT_STEP_COUNT = 3;
const STEP_DELAY_MS = 500;
const FALLBACK_AGENT_ID = 'agent-forge-core-stub';

const fakeSteps = [
  {
    action: 'inspect-task',
    output: 'Reviewed the task intent and available context.'
  },
  {
    action: 'plan-work',
    output: 'Outlined a minimal implementation path for the requested task.'
  },
  {
    action: 'report-progress',
    output: 'Prepared a stub result for downstream orchestration.'
  }
] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function deriveAgentId(worktree: string): string {
  const leaf = worktree.trim().split(/[\\/]+/).filter(Boolean).at(-1) ?? '';
  const safeLeaf = leaf
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return safeLeaf ? `agent-${safeLeaf}` : FALLBACK_AGENT_ID;
}

function stepCount(maxSteps: number | undefined): number {
  if (maxSteps === undefined || !Number.isFinite(maxSteps)) {
    return DEFAULT_STEP_COUNT;
  }

  return Math.min(DEFAULT_STEP_COUNT, Math.max(0, Math.trunc(maxSteps)));
}

export const runAgent: RunAgent = async function* runAgent(task, cfg) {
  if (useRealCodex()) {
    yield* runRealCodexAgent(task, cfg);
    return;
  }

  const agentId = deriveAgentId(cfg.worktree);
  const totalSteps = stepCount(cfg.maxSteps);

  for (let index = 0; index < totalSteps; index += 1) {
    if (index > 0) {
      await delay(STEP_DELAY_MS);
    }

    const template = fakeSteps[index]!;
    const step: Step = {
      id: `${task.id}:stub-step-${index + 1}`,
      agentId,
      action: template.action,
      output: template.output,
      ts: Date.now()
    };

    yield step;
  }
};

function useRealCodex(): boolean {
  const value = process.env.USE_REAL_CODEX;
  return value === '1' || value === 'true' || value === 'yes';
}
