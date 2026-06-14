import { describe, expect, it } from 'vitest';

import { createFixtureGraph, createFixtureTask } from '../src/fixture.js';
import { integrationGate } from '../src/gate.js';
import { integrate } from '../src/integrate.js';
import { selectBest } from '../src/select.js';

describe('compose integration', () => {
  it('assembles selected components and gates the whole artifact', async () => {
    const graph = createFixtureGraph();
    const task = createFixtureTask();
    const selected = selectBest(graph);
    const integration = await integrate(selected, graph, task);
    const gate = await integrationGate(integration.artifactPath, task);

    expect(selected.find((candidate) => candidate.componentId === 'model')?.variantId).toBe(
      'model:blender'
    );
    expect(gate.passed).toBe(true);
    expect(task.integration?.passed).toBe(true);
  }, 15_000);

  it('returns a repair task when contracts cannot be wired', async () => {
    const graph = createFixtureGraph();
    graph.components = graph.components.map((component) =>
      component.id === 'shell'
        ? { ...component, contract: { ...component.contract, consumes: ['missing.glb'] } }
        : component
    );
    const task = createFixtureTask();
    const selected = selectBest(graph);
    const integration = await integrate(selected, graph, task);
    const gate = await integrationGate(integration.artifactPath, task);

    expect(gate.passed).toBe(false);
    expect(task.context.repairTask).toMatchObject({
      origin: 'subtask',
      parentId: task.id
    });
    expect(gate.gate.notes).toContain('No selected model produces an asset consumed by the shell');
  }, 15_000);
});
