import { gate } from './gate.js';
import { generateRubric } from './rubric.js';
import { score } from './score.js';
import { replayFixtures } from './fixtures.js';

const rows = [];

for (const fixture of replayFixtures) {
  const rubric = await generateRubric(fixture.task.context);
  const result = await score(fixture.task, fixture.step, rubric);
  const verdict = gate(result);

  rows.push({
    fixture: fixture.name,
    plan: result.planAdherence.toFixed(2),
    tools: result.toolCorrectness.toFixed(2),
    completion: result.taskCompletion.toFixed(2),
    overall: result.overall.toFixed(2),
    verdict,
    notes: result.notes ?? ''
  });
}

console.table(rows);
