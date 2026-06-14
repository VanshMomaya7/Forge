import type { TaskUpdatedEvent } from "../shared/task";
import { isTaskUpdatedEvent } from "../shared/task";
import { startMockTaskStream } from "../mock/mockEmitter";

export type StreamMode = "connecting" | "ws" | "mock";

export interface ConnectTaskUpdatesOptions {
  wsUrl?: string;
  repo?: string;
  onEvent: (event: TaskUpdatedEvent) => void;
  onModeChange?: (mode: StreamMode) => void;
}

export function connectTaskUpdates(options: ConnectTaskUpdatesOptions): () => void {
  if (!options.wsUrl) {
    options.onModeChange?.("mock");
    return startMockTaskStream({
      onEvent: options.onEvent,
      repo: options.repo,
      loop: true,
    });
  }

  options.onModeChange?.("connecting");

  let disposed = false;
  let mockCleanup: (() => void) | undefined;
  const socket = new WebSocket(options.wsUrl);

  socket.addEventListener("open", () => {
    if (!disposed) options.onModeChange?.("ws");
  });

  socket.addEventListener("message", (message) => {
    try {
      const event = JSON.parse(String(message.data));
      if (isTaskUpdatedEvent(event)) options.onEvent(event);
    } catch {
      // Ignore malformed events so the cockpit never drops the live session.
    }
  });

  const fallbackToMock = () => {
    if (disposed || mockCleanup) return;
    options.onModeChange?.("mock");
    mockCleanup = startMockTaskStream({
      onEvent: options.onEvent,
      repo: options.repo,
      loop: true,
    });
  };

  socket.addEventListener("error", fallbackToMock);
  socket.addEventListener("close", fallbackToMock);

  return () => {
    disposed = true;
    mockCleanup?.();
    if (
      socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN
    ) {
      socket.close();
    }
  };
}
