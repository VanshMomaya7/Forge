import path from 'node:path';

import { selectBest } from '@forge/compose';
import type { Task } from '@forge/shared/task';

import { buildComponents } from './build-components.js';
import { decompose } from './decompose.js';
import { subscribe } from './event-bus.js';
import { assembleSite, deploySite, siteGate } from './site/index.js';

// Real end-to-end harness for the three.js -> Codex Sites compose pipeline.
// Run from the forge repo root:
//   USE_REAL_CODEX=1 CODEX_BIN=... CODEX_SQLITE_HOME=... tsx packages/core/src/real-run.ts
async function main(): Promise<void> {
  const repo = process.cwd();
  const id = `real-${Date.now()}`;
  const task: Task = {
    id,
    origin: 'human',
    intent: process.env.FORGE_PROMPT ?? 'Build me a 3D game using three.js',
    context: {
      repo,
      worktreeRoot: path.join(repo, 'forge-worktrees', id),
      variants: Number(process.env.FORGE_VARIANTS ?? 3)
    },
    mode: 'compose',
    steps: [],
    verdict: 'running',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  let lastSummary = '';
  subscribe((event) => {
    const candidates = event.task.graph?.candidates ?? [];
    const summary = candidates
      .map((candidate) => {
        const score = candidate.score ? ` ${candidate.score.overall.toFixed(2)}` : '';
        const last = candidate.steps.at(-1)?.action ?? 'queued';
        return `${candidate.variantId}[${candidate.steps.length}:${last}${score}]`;
      })
      .join('  ');
    if (summary && summary !== lastSummary) {
      lastSummary = summary;
      console.log(`  ${summary}`);
    }
  });

  console.log(`intent: ${task.intent}`);
  console.log('USE_REAL_CODEX=', process.env.USE_REAL_CODEX ?? '(unset)');

  console.log('\n[1/5] decompose');
  const graph = await decompose(task);
  task.graph = graph;
  console.log(
    '  components:',
    graph.components
      .map((component) => `${component.id}/${component.strategy}${component.variants ? `x${component.variants}` : ''}`)
      .join(', ')
  );

  console.log('\n[2/5] buildComponents (Codex agents in isolated worktrees)');
  task.graph = await buildComponents(graph, task);

  console.log('\n[3/5] selectBest');
  const selected = selectBest(task.graph);
  task.selected = selected;
  console.log(
    '  selected:',
    selected.map((candidate) => `${candidate.componentId}:${candidate.variantId} (${candidate.score?.overall ?? 'n/a'})`).join(', ')
  );

  console.log('\n[4/5] assembleSite');
  const { artifactPath } = await assembleSite(selected, task.graph, task);
  console.log('  artifact:', artifactPath);

  console.log('\n[4.5/5] siteGate');
  const gate = await siteGate(artifactPath, task);
  console.log('  gate passed=', gate.passed);
  console.log('  notes:', gate.gate.notes?.replace(/\n/g, '\n         '));

  if (process.env.FORGE_DEPLOY === '1') {
    console.log('\n[5/5] deploy -> Codex Sites');
    const result = await deploySite(artifactPath, task);
    if (result.deployUrl) {
      console.log('  DEPLOY_URL:', result.deployUrl);
    } else {
      console.log('  DEPLOY BLOCKED:', result.blocker);
    }
  } else {
    console.log('\n[5/5] deploy skipped (set FORGE_DEPLOY=1 to publish to Codex Sites)');
  }

  console.log('\nDONE. artifact=', artifactPath);
}

await main();
