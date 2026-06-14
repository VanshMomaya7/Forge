import type { Rubric } from '@forge/shared/contracts';
import type { ScoreResult, Step, Task, Verdict } from '@forge/shared/task';

import { BLOCK_OVERALL_THRESHOLD } from './constants.js';
import { gate } from './gate.js';
import { generateRubric } from './rubric.js';
import { score } from './score.js';
import { replayFixtures } from './fixtures.js';

export type EvalCheckSeverity = 'error' | 'warn';

export type EvalCheck = {
  name: string;
  passed: boolean;
  severity: EvalCheckSeverity;
  message: string;
};

export type EvalDecision = {
  taskId: string;
  stepId: string;
  rubric: Rubric;
  score: ScoreResult;
  verdict: Verdict;
  checks: EvalCheck[];
};

export async function checkTask(task: Task, step: Step): Promise<EvalDecision> {
  const rubric = await generateRubric(task.context);
  const result = await score(task, step, rubric);
  const verdict = gate(result);

  return {
    taskId: task.id,
    stepId: step.id,
    rubric,
    score: result,
    verdict,
    checks: [
      ...checkRubric(rubric),
      ...checkScore(result),
      ...checkVerdict(result, verdict)
    ]
  };
}

export async function runReplayChecks(): Promise<EvalCheck[]> {
  const decisions = [];

  for (const fixture of replayFixtures) {
    decisions.push({
      fixture: fixture.name,
      decision: await checkTask(fixture.task, fixture.step)
    });
  }

  const blocked = decisions.filter(({ decision }) => decision.verdict === 'block');
  const redis = decisions.find(({ fixture }) => fixture === 'Redis sliding window');
  const inMemory = decisions.find(({ fixture }) => fixture === 'in-memory counter, not distributed');

  return [
    {
      name: 'replay.exactly-one-block',
      passed: blocked.length === 1,
      severity: 'error',
      message: `Expected exactly one blocked fixture, saw ${blocked.length}.`
    },
    {
      name: 'replay.blocks-distributed-state-violation',
      passed: blocked[0]?.fixture === 'in-memory counter, not distributed',
      severity: 'error',
      message: 'The in-memory counter fixture must be the blocked decision.'
    },
    {
      name: 'replay.redis-beats-in-memory',
      passed:
        redis !== undefined &&
        inMemory !== undefined &&
        redis.decision.score.overall > inMemory.decision.score.overall,
      severity: 'error',
      message: 'The Redis sliding-window fixture must outscore the in-memory counter.'
    },
    ...decisions.flatMap(({ decision }) => decision.checks)
  ];
}

export function checkRubric(rubric: Rubric): EvalCheck[] {
  const total = rubric.weights.reduce((sum, weight) => sum + weight, 0);

  return [
    {
      name: 'rubric.criteria-count',
      passed: rubric.criteria.length >= 3 && rubric.criteria.length <= 5,
      severity: 'error',
      message: `Rubric has ${rubric.criteria.length} criteria; expected 3 to 5.`
    },
    {
      name: 'rubric.weights-align',
      passed: rubric.criteria.length === rubric.weights.length,
      severity: 'error',
      message: 'Rubric criteria and weights must align one-to-one.'
    },
    {
      name: 'rubric.weights-sum',
      passed: Math.abs(total - 1) <= 0.001,
      severity: 'error',
      message: `Rubric weights must sum to 1; saw ${total.toFixed(4)}.`
    }
  ];
}

export function checkScore(result: ScoreResult): EvalCheck[] {
  const values = [
    result.planAdherence,
    result.toolCorrectness,
    result.taskCompletion,
    result.overall
  ];

  return [
    {
      name: 'score.bounded',
      passed: values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
      severity: 'error',
      message: 'All score dimensions must be finite values between 0 and 1.'
    },
    {
      name: 'score.rubric-pass-consistent',
      passed: result.rubricPass === result.overall >= BLOCK_OVERALL_THRESHOLD,
      severity: 'warn',
      message: 'rubricPass should match the configured overall pass threshold.'
    }
  ];
}

export function checkVerdict(result: ScoreResult, verdict: Verdict): EvalCheck[] {
  return [
    {
      name: 'verdict.blocks-failed-rubric',
      passed: result.rubricPass || verdict === 'block',
      severity: 'error',
      message: 'A failed rubric must block the step.'
    },
    {
      name: 'verdict.blocks-low-overall',
      passed: result.overall >= BLOCK_OVERALL_THRESHOLD || verdict === 'block',
      severity: 'error',
      message: 'A score below the block threshold must block the step.'
    }
  ];
}
