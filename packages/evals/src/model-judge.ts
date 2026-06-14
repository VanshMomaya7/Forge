import type { Rubric } from '@forge/shared/contracts';
import type { ScoreResult, Step, Task } from '@forge/shared/task';

import { BLOCK_OVERALL_THRESHOLD } from './constants.js';
import { clamp01, roundScore, weightedOverall } from './math.js';
import { ScoreResultSchema } from './schemas.js';

export const JUDGE_MODEL = 'gpt-4.1-mini';
export const JUDGE_TEMPERATURE = 0;

export async function scoreWithModel(
  task: Task,
  step: Step,
  rubric: Rubric
): Promise<ScoreResult | undefined> {
  if (process.env.FORGE_EVALS_USE_MODEL !== '1' || !process.env.OPENAI_API_KEY) {
    return undefined;
  }

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.FORGE_EVALS_JUDGE_MODEL ?? JUDGE_MODEL,
      temperature: JUDGE_TEMPERATURE,
      max_output_tokens: 500,
      input: [
        {
          role: 'system',
          content:
            'You are Forge evals. Return only JSON with planAdherence, toolCorrectness, taskCompletion, and notes. Scores are 0..1.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            intent: task.intent,
            plan: task.plan ?? [],
            rubric,
            step: {
              action: step.action,
              output: step.output
            }
          })
        }
      ]
    } as never);
    const json = parseJsonObject(extractText(response));
    const planAdherence = roundScore(clamp01(Number(json.planAdherence)));
    const toolCorrectness = roundScore(clamp01(Number(json.toolCorrectness)));
    const taskCompletion = roundScore(clamp01(Number(json.taskCompletion)));
    const overall = weightedOverall({ planAdherence, toolCorrectness, taskCompletion }, rubric.weights);
    const candidate: ScoreResult = {
      rubricPass: overall >= BLOCK_OVERALL_THRESHOLD,
      planAdherence,
      toolCorrectness,
      taskCompletion,
      overall
    };

    if (typeof json.notes === 'string') {
      candidate.notes = json.notes.slice(0, 240);
    }

    const parsed = ScoreResultSchema.safeParse(candidate);
    return parsed.success ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function extractText(response: unknown): string {
  const outputText = (response as { output_text?: unknown }).output_text;

  if (typeof outputText === 'string') {
    return outputText;
  }

  return JSON.stringify(response);
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    return {};
  }

  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;

  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
