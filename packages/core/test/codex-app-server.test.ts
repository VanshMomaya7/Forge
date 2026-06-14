import type { AgentConfig } from '@forge/shared/contracts';
import type { Task } from '@forge/shared/task';
import { describe, expect, it, vi } from 'vitest';

import {
  notificationToStep,
  runCodexAppServer,
  type CodexAppServerTransport
} from '../src/codex-app-server.js';

describe('codex app-server runner', () => {
  it('translates completed app-server items into Forge steps', () => {
    vi.setSystemTime(12_345);

    const step = notificationToStep(
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'item-1',
            type: 'agentMessage',
            text: 'Done'
          }
        }
      },
      makeTask(),
      makeConfig(),
      1
    );

    expect(step).toEqual({
      id: 'task-1:codex-step-1',
      agentId: 'codex-forge-child-1',
      action: 'agentMessage.completed',
      output: 'Done',
      ts: 12_345
    });
  });

  it('starts an app-server thread and streams notifications without buffering', async () => {
    const transport = new MockTransport([
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'item-1',
            type: 'agentMessage',
            text: 'First'
          }
        }
      },
      {
        method: 'item/completed',
        params: {
          item: {
            id: 'item-2',
            type: 'commandExecution',
            command: 'pnpm test',
            aggregatedOutput: 'pass'
          }
        }
      },
      {
        method: 'turn/completed',
        params: {
          turn: { id: 'turn-1' }
        }
      }
    ]);

    const iterator = runCodexAppServer(makeTask(), makeConfig(), { transport });

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { output: 'First' }
    });
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        action: 'commandExecution.completed',
        output: 'pnpm test\npass'
      }
    });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    expect(transport.closed).toBe(true);
    expect(transport.requests.map((request) => request.method)).toEqual([
      'initialize',
      'thread/start',
      'turn/start'
    ]);
    expect(transport.notificationsSent).toEqual([{ method: 'initialized', params: {} }]);
  });
});

function makeTask(): Task {
  return {
    id: 'task-1',
    origin: 'human',
    intent: 'Implement a feature',
    context: { repo: 'forge' },
    steps: [],
    verdict: 'running',
    createdAt: 1,
    updatedAt: 1
  };
}

function makeConfig(): AgentConfig {
  return {
    worktree: 'E:\\worktrees\\forge-child-1'
  };
}

class MockTransport implements CodexAppServerTransport {
  readonly requests: Array<{ method: string; params?: unknown }> = [];
  readonly notificationsSent: Array<{ method: string; params?: unknown }> = [];
  closed = false;

  constructor(private readonly queuedNotifications: Array<{ method: string; params?: unknown }>) {}

  async request(method: string, params?: unknown): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === 'thread/start') {
      return { thread: { id: 'thread-1' } };
    }

    return {};
  }

  notify(method: string, params?: unknown): void {
    this.notificationsSent.push({ method, params });
  }

  async *notifications(): AsyncIterable<{ method: string; params?: unknown }> {
    for (const notification of this.queuedNotifications) {
      yield notification;
    }
  }

  close(): void {
    this.closed = true;
  }
}
