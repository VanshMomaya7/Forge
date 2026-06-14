import { describe, expect, it } from 'vitest';

import {
  aggregateScore,
  checkScore,
  gate,
  generateRubric,
  runReplayChecks,
  score
} from '../src/index.js';
import { replayFixtures } from '../src/fixtures.js';
import { parseJsonObject } from '../src/model-judge.js';
import { sanitizeScore } from '../src/score.js';

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

  it('redirects technically plausible work that solves the wrong target', async () => {
    const fixture = replayFixtures[1]!;
    const rubric = await generateRubric(fixture.task.context);
    const result = await score(
      fixture.task,
      {
        ...fixture.step,
        output: 'Implemented a solid Redis sliding window for /api/signup, a different endpoint.'
      },
      rubric
    );

    expect(gate(result)).toBe('redirect');
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

  it('runs replay quality checks without errors', async () => {
    const checks = await runReplayChecks();

    expect(checks.filter((check) => !check.passed && check.severity === 'error')).toEqual([]);
  });

  it('parses fenced judge JSON', () => {
    expect(parseJsonObject('```json\n{"planAdherence":0.8}\n```')).toEqual({
      planAdherence: 0.8
    });
  });

  it('sanitizes malformed score values into bounded scores', () => {
    const result = sanitizeScore({
      rubricPass: true,
      planAdherence: Number.NaN,
      toolCorrectness: 2,
      taskCompletion: -1,
      overall: Number.POSITIVE_INFINITY
    });

    expect(checkScore(result).every((check) => check.passed)).toBe(true);
  });
});
