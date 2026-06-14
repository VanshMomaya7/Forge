import type { Task } from '@forge/shared/task';

import { subscribe } from './event-bus.js';
import { deploySite } from './site/index.js';

// Deploy an already-assembled site artifact to Codex Sites:
//   USE_REAL_CODEX=1 CODEX_BIN=... CODEX_SQLITE_HOME=... \
//     tsx packages/core/src/deploy-run.ts <artifactPath>
const artifactPath = process.argv[2];
if (!artifactPath) {
  console.error('usage: deploy-run.ts <artifactPath>');
  process.exit(1);
}

const task: Task = {
  id: `deploy-${Date.now()}`,
  origin: 'human',
  intent: process.env.FORGE_PROMPT ?? 'Build me a 3D game using three.js',
  context: { repo: process.cwd() },
  mode: 'compose',
  steps: [],
  verdict: 'running',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

subscribe((event) => {
  const deploy = event.task.graph?.candidates?.find((candidate) => candidate.componentId === 'deploy');
  const last = deploy?.steps.at(-1);
  if (last) {
    console.log(`  [deploy] ${last.action}: ${last.output.slice(0, 140).replace(/\n/g, ' ')}`);
  }
});

console.log(`deploying ${artifactPath} to Codex Sites...`);
const result = await deploySite(artifactPath, task);
console.log('\n==== DEPLOY RESULT ====');
if (result.deployUrl) {
  console.log('DEPLOY_URL=', result.deployUrl);
} else {
  console.log('BLOCKER:', result.blocker);
}
