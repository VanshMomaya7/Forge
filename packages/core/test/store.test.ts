import type { Task } from '@forge/shared/task';
import { describe, expect, it, vi } from 'vitest';

async function loadStore() {
  vi.resetModules();
  return import('../src/store');
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    origin: 'human',
    intent: 'Add a task store',
    context: {},
    steps: [],
    verdict: 'running',
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

describe('task store', () => {
  it('inserts a task and preserves object identity', async () => {
    const store = await loadStore();
    const task = makeTask();

    const inserted = store.upsert(task);

    expect(inserted).toBe(task);
    expect(store.get(task.id)).toBe(task);
  });

  it('updates an existing task by id', async () => {
    const store = await loadStore();
    const original = makeTask({ intent: 'Original intent', updatedAt: 1 });
    const updated = makeTask({ intent: 'Updated intent', updatedAt: 2 });

    store.upsert(original);
    const result = store.upsert(updated);

    expect(result).toBe(updated);
    expect(store.get(original.id)).toBe(updated);
    expect(store.list()).toEqual([updated]);
  });

  it('returns undefined for missing tasks', async () => {
    const store = await loadStore();

    expect(store.get('missing')).toBeUndefined();
  });

  it('lists inserted tasks in insertion order', async () => {
    const store = await loadStore();
    const first = makeTask({ id: 'task-1' });
    const second = makeTask({ id: 'task-2' });

    store.upsert(first);
    store.upsert(second);

    expect(store.list()).toEqual([first, second]);
    expect(store.list()[0]).toBe(first);
    expect(store.list()[1]).toBe(second);
  });
});
