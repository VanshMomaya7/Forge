import { runReplayChecks } from './checks.js';
import { checkTask } from './checks.js';
import { replayFixtures } from './fixtures.js';

const rows = [];

for (const fixture of replayFixtures) {
  const decision = await checkTask(fixture.task, fixture.step);

  rows.push({
    fixture: fixture.name,
    plan: decision.score.planAdherence.toFixed(2),
    tools: decision.score.toolCorrectness.toFixed(2),
    completion: decision.score.taskCompletion.toFixed(2),
    overall: decision.score.overall.toFixed(2),
    verdict: decision.verdict,
    notes: decision.score.notes ?? ''
  });
}

console.table(rows);

const checks = await runReplayChecks();
const failed = checks.filter((check) => !check.passed && check.severity === 'error');

if (failed.length > 0) {
  console.table(failed);
  process.exitCode = 1;
}
