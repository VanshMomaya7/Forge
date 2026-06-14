import { EventEmitter } from 'node:events';

import type { Task } from '@forge/shared/task';
import WebSocket, { WebSocketServer } from 'ws';

export type TaskUpdatedEvent = {
  type: 'task.updated';
  task: Task;
};

export type TaskUpdatedListener = (event: TaskUpdatedEvent) => void;

export type StartEventBusServerOptions = {
  host?: string;
  port?: number;
};

export type EventBusServer = {
  host: string;
  port: number;
  url: string;
  stop: () => Promise<void>;
};

const taskUpdatedEventName = 'task.updated';
const emitter = new EventEmitter();
const websocketServers = new Set<WebSocketServer>();

export function emitTaskUpdated(task: Task): TaskUpdatedEvent {
  const event: TaskUpdatedEvent = { type: taskUpdatedEventName, task };

  emitter.emit(taskUpdatedEventName, event);
  broadcast(event);

  return event;
}

export function subscribe(listener: TaskUpdatedListener): () => void {
  emitter.on(taskUpdatedEventName, listener);

  return () => {
    emitter.off(taskUpdatedEventName, listener);
  };
}

export async function startEventBusServer(
  options: StartEventBusServerOptions = {}
): Promise<EventBusServer> {
  const host = options.host ?? '127.0.0.1';
  const server = new WebSocketServer({ host, port: options.port ?? 0 });

  await waitForListening(server);
  websocketServers.add(server);

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port ?? 0;
  const boundHost =
    typeof address === 'object' && address !== null && address.address !== '::'
      ? address.address
      : host;
  const urlHost = boundHost.includes(':') ? `[${boundHost}]` : boundHost;
  let stopped = false;

  return {
    host: boundHost,
    port,
    url: `ws://${urlHost}:${port}`,
    stop: async () => {
      if (stopped) {
        return;
      }

      stopped = true;
      websocketServers.delete(server);

      for (const client of server.clients) {
        client.terminate();
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

function broadcast(event: TaskUpdatedEvent): void {
  const message = JSON.stringify(event);

  for (const server of websocketServers) {
    for (const client of server.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}

function waitForListening(server: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      reject(error);
    };

    server.once('listening', handleListening);
    server.once('error', handleError);
  });
}
