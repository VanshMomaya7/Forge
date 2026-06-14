import type { Step, Task } from '@forge/shared/task';

export type ReplayFixture = {
  name: string;
  task: Task;
  step: Step;
};

export const replayFixtures: ReplayFixture[] = [
  makeFixture(
    'in-memory counter, not distributed',
    'Added an in-memory counter Map for /api/login rate limiting. Tests pass locally, but state is per process.'
  ),
  makeFixture(
    'Redis sliding window',
    'Implemented Redis sliding window rate limiting for /api/login with atomic expiry and integration tests.'
  ),
  makeFixture(
    'edge middleware guard',
    'Added middleware guard for /api/login, patched the route, and verified request throttling tests.'
  )
];

function makeFixture(name: string, output: string): ReplayFixture {
  const now = 1_700_000_000_000;
  const task: Task = {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    origin: 'human',
    intent: 'Add distributed rate-limiting to /api/login.',
    context: {
      repo: 'Forge',
      intent: 'Add distributed rate-limiting to /api/login.'
    },
    mode: 'race',
    plan: [
      'Use distributed state so parallel server instances share limits.',
      'Apply the limiter to /api/login.',
      'Verify the behavior with tests.'
    ],
    steps: [],
    verdict: 'running',
    createdAt: now,
    updatedAt: now
  };
  const step: Step = {
    id: `${task.id}:step-1`,
    agentId: `agent-${task.id}`,
    action: 'implement-rate-limit',
    output,
    ts: now
  };

  return { name, task, step };
}
