import { describe, expect, it } from 'vitest';

import { aggregateScore, gate, generateRubric, score } from '../src/index.js';
import { replayFixtures } from '../src/fixtures.js';

describe('evals package', () => {
  it('generates a valid rubric with normalized weights', async () => {
    const rubric = await generateRubric({ repo: 'Forge', intent: 'Ship a demo' });

    expect(rubric.criteria.length).toBeGreaterThanOrEqual(3);
    expect(rubric.weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
  });

  it('scores and gates replay fixtures with exactly one blocked result', async () => {
    const verdicts = [];

    for (const fixture of replayFixtures) {
      const rubric = await generateRubric(fixture.task.context);
      const result = await score(fixture.task, fixture.step, rubric);
      verdicts.push(gate(result));
    }

    expect(verdicts.filter((verdict) => verdict === 'block')).toHaveLength(1);
    expect(verdicts).toContain('pass');
  });

  it('aggregates finished task step scores', async () => {
    const fixture = replayFixtures[1]!;
    const rubric = await generateRubric(fixture.task.context);
    const result = await score(fixture.task, fixture.step, rubric);
    const task = aggregateScore({
      ...fixture.task,
      steps: [{ ...fixture.step, scores: result, verdict: gate(result) }]
    });

    expect(task.scores).toEqual(result);
  });
});
