import type { TaskUpdatedEvent } from "../shared/task";
import { isTaskUpdatedEvent } from "../shared/task";

export type StreamMode = "connecting" | "ws";

export interface ConnectTaskUpdatesOptions {
  wsUrl: string;
  onEvent: (event: TaskUpdatedEvent) => void;
  onModeChange?: (mode: StreamMode) => void;
  // Fired once when the backend looks unreachable (repeated failed connects),
  // so the cockpit can fall back to a fully client-side run.
  onUnreachable?: () => void;
}

const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 8000;
const UNREACHABLE_AFTER_ATTEMPTS = 2;

// Always consumes the real task.updated websocket bus and reconnects on drops.
// There is no mock fallback — the cockpit only ever shows real runs.
export function connectTaskUpdates(options: ConnectTaskUpdatesOptions): () => void {
  let disposed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let unreachableNotified = false;

  function scheduleReconnect(): void {
    if (disposed || reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempts);
    attempts += 1;
    options.onModeChange?.("connecting");
    if (attempts >= UNREACHABLE_AFTER_ATTEMPTS && !unreachableNotified) {
      unreachableNotified = true;
      options.onUnreachable?.();
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  }

  function connect(): void {
    if (disposed) return;
    options.onModeChange?.("connecting");

    try {
      socket = new WebSocket(options.wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", () => {
      if (disposed) return;
      attempts = 0;
      options.onModeChange?.("ws");
    });
    socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data));
        if (isTaskUpdatedEvent(event)) options.onEvent(event);
      } catch {
        // Ignore malformed frames so the cockpit never drops the live session.
      }
    });
    socket.addEventListener("error", scheduleReconnect);
    socket.addEventListener("close", scheduleReconnect);
  }

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (
      socket &&
      (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
    ) {
      socket.close();
    }
  };
}
