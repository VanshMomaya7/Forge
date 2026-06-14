import type { ScoreResult, Step, Task } from '@forge/shared/task';

import type { Rubric } from './contracts.js';
import { BLOCK_OVERALL_THRESHOLD, JUDGE_TIMEOUT_MS, MAX_NOTES_LENGTH } from './constants.js';
import { clamp01, roundScore, weightedOverall } from './math.js';
import { RubricSchema, ScoreResultSchema } from './schemas.js';

export const JUDGE_MODEL = 'gpt-4.1-mini';
export const JUDGE_TEMPERATURE = 0;

export async function generateRubricWithModel(
  context: Record<string, unknown>
): Promise<Rubric | undefined> {
  if (process.env.FORGE_EVALS_USE_MODEL !== '1' || !process.env.OPENAI_API_KEY) {
    return undefined;
  }

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await withTimeout(client.responses.create({
      model: process.env.FORGE_EVALS_JUDGE_MODEL ?? JUDGE_MODEL,
      temperature: JUDGE_TEMPERATURE,
      max_output_tokens: 700,
      input: [
        {
          role: 'system',
          content:
            'You generate Forge eval rubrics. Return only JSON: { "id": string, "criteria": string[], "weights": number[] }. Use 3 to 5 criteria and weights summing to 1.'
        },
        {
          role: 'user',
          content: JSON.stringify({ context })
        }
      ]
    } as never));
    const json = parseJsonObject(extractText(response));
    const parsed = RubricSchema.safeParse(json);

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

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
    const response = await withTimeout(client.responses.create({
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
    } as never));
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
      candidate.notes = json.notes.slice(0, MAX_NOTES_LENGTH);
    }

    const parsed = ScoreResultSchema.safeParse(candidate);
    return parsed.success ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export function extractText(response: unknown): string {
  const outputText = (response as { output_text?: unknown }).output_text;

  if (typeof outputText === 'string') {
    return outputText;
  }

  const output = (response as { output?: unknown }).output;

  if (Array.isArray(output)) {
    const text = output
      .flatMap((item) => {
        const content = (item as { content?: unknown }).content;
        return Array.isArray(content) ? content : [];
      })
      .map((content) => {
        const textValue = (content as { text?: unknown }).text;
        return typeof textValue === 'string' ? textValue : '';
      })
      .filter(Boolean)
      .join('\n');

    if (text.length > 0) {
      return text;
    }
  }

  return JSON.stringify(response);
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
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

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Judge model timed out after ${JUDGE_TIMEOUT_MS}ms`));
    }, JUDGE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
