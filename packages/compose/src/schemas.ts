import { z } from 'zod';

export const scoreResultSchema = z.object({
  rubricPass: z.boolean(),
  planAdherence: z.number(),
  toolCorrectness: z.number(),
  taskCompletion: z.number(),
  overall: z.number(),
  notes: z.string().optional()
});

export const componentCandidateSchema = z.object({
  componentId: z.string(),
  variantId: z.string(),
  worktree: z.string(),
  steps: z.array(z.unknown()),
  score: scoreResultSchema.optional(),
  artifactPath: z.string().optional()
});

export const componentGraphSchema = z.object({
  components: z.array(
    z.object({
      id: z.string(),
      goal: z.string(),
      contract: z.object({
        produces: z.array(z.string()).optional(),
        consumes: z.array(z.string()).optional(),
        entry: z.string().optional()
      }),
      strategy: z.enum(['assign', 'race']),
      variants: z.number().optional()
    })
  ),
  candidates: z.array(componentCandidateSchema)
});
