import { z } from 'zod';

import { MAX_RUBRIC_CRITERIA, MIN_RUBRIC_CRITERIA } from './constants.js';

export const RubricSchema = z
  .object({
    id: z.string().min(1),
    criteria: z.array(z.string().trim().min(1)).min(MIN_RUBRIC_CRITERIA).max(MAX_RUBRIC_CRITERIA),
    weights: z.array(z.number().finite().nonnegative()).min(MIN_RUBRIC_CRITERIA).max(MAX_RUBRIC_CRITERIA)
  })
  .superRefine((rubric, ctx) => {
    if (rubric.criteria.length !== rubric.weights.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'criteria and weights must have the same length'
      });
    }

    const total = rubric.weights.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(total - 1) > 0.001) {
      ctx.addIssue({
        code: 'custom',
        message: 'weights must sum to 1'
      });
    }
  });

export const ScoreResultSchema = z.object({
  rubricPass: z.boolean(),
  planAdherence: z.number().finite().min(0).max(1),
  toolCorrectness: z.number().finite().min(0).max(1),
  taskCompletion: z.number().finite().min(0).max(1),
  overall: z.number().finite().min(0).max(1),
  notes: z.string().optional()
});
