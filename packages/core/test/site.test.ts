import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ComponentCandidate } from '@forge/shared/component';
import type { Task } from '@forge/shared/task';
import { describe, expect, it } from 'vitest';

import { decompose } from '../src/decompose.js';
import { emitTaskUpdated, subscribe } from '../src/event-bus.js';
import { assembleSite, isSiteGraph } from '../src/site/assemble.js';
import { siteGate } from '../src/site/gate.js';

const GOOD_GAME = `"use client";
import * as THREE from "three";
import { useRef } from "react";

export default function Game() {
  const ref = useRef<HTMLCanvasElement>(null);
  const renderer = new THREE.WebGLRenderer();
  void renderer;
  return <canvas ref={ref} />;
}
`;

const GOOD_PAGE = `"use client";
import Game from "./Game";

export default function Page() {
  return <Game />;
}
`;

function makeTask(intent: string, context: Task['context'] = {}): Task {
  const now = Date.now();
  return {
    id: `test-${now}-${Math.random().toString(36).slice(2, 7)}`,
    origin: 'human',
    intent,
    context,
    mode: 'compose',
    steps: [],
    verdict: 'running',
    createdAt: now,
    updatedAt: now
  };
}

describe('three.js site compose path', () => {
  it('decomposes a three.js game into a raced game + shell site graph', async () => {
    const graph = await decompose(makeTask('Build me a 3D game using three.js'));
    const game = graph.components.find((component) => component.id === 'game');
    expect(game?.strategy).toBe('race');
    expect(game?.variants ?? 0).toBeGreaterThanOrEqual(2);
    expect(graph.components.some((component) => component.id === 'shell')).toBe(true);
    expect(isSiteGraph(graph)).toBe(true);
  });

  it('leaves the static 3D-website graph as a non-site graph', async () => {
    const graph = await decompose(makeTask('Build me a 3D model website.'));
    expect(isSiteGraph(graph)).toBe(false);
  });

  it('passes the site gate for a valid game and blocks an invalid one', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'forge-gate-'));
    try {
      await mkdir(path.join(dir, 'source'), { recursive: true });
      await writeFile(path.join(dir, 'source', 'Game.tsx'), GOOD_GAME, 'utf8');
      await writeFile(path.join(dir, 'source', 'page.tsx'), GOOD_PAGE, 'utf8');
      const pass = await siteGate(dir, makeTask('game'));
      expect(pass.passed).toBe(true);

      await writeFile(path.join(dir, 'source', 'Game.tsx'), 'export const broken = (', 'utf8');
      const block = await siteGate(dir, makeTask('game'));
      expect(block.passed).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('assembles a deployable site source from the selected candidates', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'forge-asm-'));
    try {
      const gameWorktree = path.join(root, 'wt-game');
      const shellWorktree = path.join(root, 'wt-shell');
      await mkdir(gameWorktree, { recursive: true });
      await mkdir(shellWorktree, { recursive: true });
      await writeFile(path.join(gameWorktree, 'Game.tsx'), GOOD_GAME, 'utf8');
      await writeFile(path.join(shellWorktree, 'page.tsx'), GOOD_PAGE, 'utf8');

      const task = makeTask('Build me a 3D game using three.js', {
        siteRoot: path.join(root, 'site')
      });
      const graph = await decompose(task);
      const selected: ComponentCandidate[] = [
        { componentId: 'game', variantId: 'game:variant-1', worktree: gameWorktree, steps: [] },
        { componentId: 'shell', variantId: 'shell:0', worktree: shellWorktree, steps: [] }
      ];

      const result = await assembleSite(selected, graph, task);
      const game = await readFile(path.join(result.artifactPath, 'source', 'Game.tsx'), 'utf8');
      expect(game).toContain('three');
      const manifest = JSON.parse(
        await readFile(path.join(result.artifactPath, 'FORGE_SITE.json'), 'utf8')
      ) as { kind: string };
      expect(manifest.kind).toBe('vinext-three');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('emits task.updated through the core event bus', () => {
    const events: { type: string; task: { id: string } }[] = [];
    const off = subscribe((event) => events.push(event));
    const task = makeTask('emit check');
    emitTaskUpdated(task);
    off();
    expect(events.some((event) => event.type === 'task.updated' && event.task.id === task.id)).toBe(
      true
    );
  });
});
