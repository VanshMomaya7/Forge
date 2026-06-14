import { z } from 'zod';

export const RubricSchema = z
  .object({
    id: z.string().min(1),
    criteria: z.array(z.string().min(1)).min(1).max(5),
    weights: z.array(z.number().finite().nonnegative()).min(1).max(5)
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
  planAdherence: z.number().min(0).max(1),
  toolCorrectness: z.number().min(0).max(1),
  taskCompletion: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
  notes: z.string().optional()
});
