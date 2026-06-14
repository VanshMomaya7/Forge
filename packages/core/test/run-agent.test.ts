import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Step, Task } from '@forge/shared/task';
import { runAgent } from '../src/run-agent.js';

function makeTask(): Task {
  return {
    id: 'task-1',
    origin: 'human',
    intent: 'Add a runner stub',
    context: {},
    mode: 'race',
    steps: [],
    verdict: 'running',
    createdAt: 1,
    updatedAt: 1
  };
}

async function isSettled<T>(promise: Promise<T>): Promise<boolean> {
  let settled = false;

  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await Promise.resolve();

  return settled;
}

async function nextStep(iterator: AsyncIterator<Step>): Promise<Step> {
  const result = await iterator.next();

  if (result.done) {
    throw new Error('Expected runAgent to yield a step');
  }

  return result.value;
}

describe('runAgent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('yields three fake steps by default with undefined scores', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const iterator = runAgent(makeTask(), {
      worktree: 'E:\\worktrees\\forge-agent-runner-stub'
    })[Symbol.asyncIterator]();

    const first = await nextStep(iterator);

    const secondPromise = nextStep(iterator);
    await vi.advanceTimersByTimeAsync(500);
    const second = await secondPromise;

    const thirdPromise = nextStep(iterator);
    await vi.advanceTimersByTimeAsync(500);
    const third = await thirdPromise;

    const steps = [first, second, third];

    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.action)).toEqual([
      'inspect-task',
      'plan-work',
      'report-progress'
    ]);
    expect(steps.every((step) => step.scores === undefined)).toBe(true);
    expect(new Set(steps.map((step) => step.agentId))).toEqual(
      new Set(['agent-forge-agent-runner-stub'])
    );
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined
    });
  });

  it('limits yielded steps with maxSteps', async () => {
    vi.useFakeTimers();

    const iterator = runAgent(makeTask(), {
      worktree: 'E:\\worktrees\\forge-agent-runner-stub',
      maxSteps: 2
    })[Symbol.asyncIterator]();

    const first = await nextStep(iterator);
    const secondPromise = nextStep(iterator);
    await vi.advanceTimersByTimeAsync(500);
    const second = await secondPromise;
    const steps = [first, second];

    expect(steps).toHaveLength(2);
    expect(steps.map((step) => step.id)).toEqual([
      'task-1:stub-step-1',
      'task-1:stub-step-2'
    ]);
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined
    });
  });

  it('streams steps about 500ms apart', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);

    const iterator = runAgent(makeTask(), {
      worktree: 'E:\\worktrees\\forge-agent-runner-stub'
    })[Symbol.asyncIterator]();

    const first = await nextStep(iterator);
    expect(first.ts).toBe(10_000);

    const secondPromise = nextStep(iterator);
    await vi.advanceTimersByTimeAsync(499);
    expect(await isSettled(secondPromise)).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const second = await secondPromise;
    expect(second.ts).toBe(10_500);

    const thirdPromise = nextStep(iterator);
    await vi.advanceTimersByTimeAsync(500);
    const third = await thirdPromise;
    expect(third.ts).toBe(11_000);

    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined
    });
  });
});
