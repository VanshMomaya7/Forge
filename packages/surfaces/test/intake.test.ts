import { describe, expect, it } from "vitest";

import type { TaskUpdatedEvent } from "../src/shared/task";

// Importing the server wiring without binding the port.
process.env.FORGE_NO_LISTEN = "1";

describe("surfaces intake -> compose bridge", () => {
  it("creates a compose task and bridges core task.updated to the ws bus", async () => {
    const server = await import("../src/server/index.js");
    const { emitTaskUpdated } = await import("@forge/core");

    const task = server.createComposeTask("Build me a 3D game using three.js", {
      origin: "human",
      mode: "compose",
    });
    expect(task.mode).toBe("compose");
    expect(typeof task.context.repo).toBe("string");

    const received: TaskUpdatedEvent[] = [];
    const off = server.bus.onTaskUpdated((event) => received.push(event));
    // Simulate a progress update emitted from inside @forge/core.runTask.
    emitTaskUpdated(task);
    off();

    expect(
      received.some((event) => event.type === "task.updated" && event.task.id === task.id),
    ).toBe(true);
  });
});
