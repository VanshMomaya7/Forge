import type { Task } from '@forge/shared/task';

const tasks = new Map<string, Task>();

export function upsert(task: Task): Task {
  tasks.set(task.id, task);
  return task;
}

export function get(id: string): Task | undefined {
  return tasks.get(id);
}

export function list(): Task[] {
  return Array.from(tasks.values());
}
