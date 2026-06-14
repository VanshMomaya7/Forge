import type { Task } from '@forge/shared/task';
import { describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

import {
  emitTaskUpdated,
  startEventBusServer,
  subscribe,
  type TaskUpdatedEvent
} from '../src/event-bus.js';

describe('event bus', () => {
  it('notifies in-process subscribers when a task is updated', () => {
    const events: TaskUpdatedEvent[] = [];
    const task = makeTask('subscribed-task');
    const unsubscribe = subscribe((event) => {
      events.push(event);
    });

    try {
      emitTaskUpdated(task);

      expect(events).toEqual([{ type: 'task.updated', task }]);
    } finally {
      unsubscribe();
    }
  });

  it('stops notifying a subscriber after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    unsubscribe();
    emitTaskUpdated(makeTask('unsubscribed-task'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('broadcasts task.updated payloads to websocket clients', async () => {
    const bus = await startEventBusServer();
    const client = await connectWebSocket(bus.url);
    const task = makeTask('websocket-task');

    try {
      const message = onceMessage(client);

      emitTaskUpdated(task);

      await expect(message).resolves.toEqual({ type: 'task.updated', task });
    } finally {
      client.terminate();
      await bus.stop();
    }
  });
});

function makeTask(id: string): Task {
  return {
    id,
    origin: 'human',
    intent: `Intent for ${id}`,
    context: {},
    steps: [],
    verdict: 'running',
    createdAt: 1,
    updatedAt: 2
  };
}

async function connectWebSocket(url: string): Promise<WebSocket> {
  const client = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });

  return client;
}

function onceMessage(client: WebSocket): Promise<TaskUpdatedEvent> {
  return new Promise((resolve, reject) => {
    client.once('message', (data) => {
      resolve(JSON.parse(data.toString()) as TaskUpdatedEvent);
    });
    client.once('error', reject);
  });
}
