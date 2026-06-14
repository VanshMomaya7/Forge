import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { TaskUpdatedEvent } from "../shared/task";

export class TaskEventBus {
  private emitter = new EventEmitter();

  emit(event: TaskUpdatedEvent): void {
    this.emitter.emit(event.type, event);
  }

  onTaskUpdated(listener: (event: TaskUpdatedEvent) => void): () => void {
    this.emitter.on("task.updated", listener);
    return () => this.emitter.off("task.updated", listener);
  }

  attach(server: Server, path = "/ws"): WebSocketServer {
    const wss = new WebSocketServer({ server, path });

    const unsubscribe = this.onTaskUpdated((event) => {
      const payload = JSON.stringify(event);
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) client.send(payload);
      }
    });

    wss.on("close", unsubscribe);
    return wss;
  }
}
