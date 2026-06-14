import type { ComponentGraph, ComponentSpec, InterfaceContract } from '@forge/shared/component';
import type { Task } from '@forge/shared/task';
import { z } from 'zod';

const DECOMPOSE_MODEL = 'gpt-4.1-mini';
const DECOMPOSE_TIMEOUT_MS = 8_000;

const InterfaceContractSchema = z
  .object({
    produces: z.array(z.string().trim().min(1)).optional(),
    consumes: z.array(z.string().trim().min(1)).optional(),
    entry: z.string().trim().min(1).optional()
  })
  .superRefine((contract, ctx) => {
    if (!contract.entry && !contract.produces?.length && !contract.consumes?.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'component contract must include produces, consumes, or entry'
      });
    }
  });

const ComponentSpecSchema = z.object({
  id: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  contract: InterfaceContractSchema,
  strategy: z.enum(['assign', 'race']),
  variants: z.number().int().positive().optional()
});

const ComponentGraphSchema = z
  .object({
    components: z.array(ComponentSpecSchema).min(2).max(8),
    candidates: z.array(z.unknown()).optional()
  })
  .superRefine((graph, ctx) => {
    const hasRace = graph.components.some(
      (component) => component.strategy === 'race' && (component.variants ?? 0) >= 2
    );

    if (!hasRace) {
      ctx.addIssue({
        code: 'custom',
        message: 'graph must include at least one race component with at least two variants'
      });
    }
  });

type ComponentGraphInput = z.infer<typeof ComponentGraphSchema>;

export async function decompose(task: Task): Promise<ComponentGraph> {
  const modelGraph = await decomposeWithModel(task);

  if (modelGraph) {
    return modelGraph;
  }

  return fallbackGraph(task);
}

async function decomposeWithModel(task: Task): Promise<ComponentGraph | undefined> {
  if (process.env.FORGE_DECOMPOSE_USE_MODEL !== '1' || !process.env.OPENAI_API_KEY) {
    return undefined;
  }

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await withTimeout(client.responses.create({
      model: process.env.FORGE_DECOMPOSE_MODEL ?? DECOMPOSE_MODEL,
      temperature: 0,
      max_output_tokens: 900,
      input: [
        {
          role: 'system',
          content:
            'You decompose Forge software tasks into independent components. Return only JSON with shape { "components": [...] }. Each component requires id, goal, contract, strategy. contract must include produces, consumes, or entry. Use strategy "race" only where variants are interchangeable under the same contract, and set variants >= 2.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            intent: task.intent,
            context: task.context
          })
        }
      ]
    } as never));
    const parsed = parseJsonObject(extractText(response));

    return normalizeGraph(parsed);
  } catch {
    return undefined;
  }
}

function fallbackGraph(task: Task): ComponentGraph {
  if (isThreeDimensionalWebsite(task.intent)) {
    return modelWebsiteGraph();
  }

  return genericGraph(task);
}

function modelWebsiteGraph(): ComponentGraph {
  return {
    components: [
      {
        id: 'renderer',
        goal: 'Build the 3D renderer entry point that mounts a model into a canvas.',
        contract: { entry: 'mountRenderer(canvas, modelUrl)' },
        strategy: 'assign'
      },
      {
        id: 'model',
        goal: 'Produce the 3D model asset used by the renderer and shell.',
        contract: { produces: ['dist/model.glb'] },
        strategy: 'race',
        variants: 2
      },
      {
        id: 'shell',
        goal: 'Build the website shell that loads the model and exposes the scene canvas.',
        contract: {
          consumes: ['model.glb'],
          entry: 'index.html with <canvas id="scene">'
        },
        strategy: 'assign'
      }
    ],
    candidates: []
  };
}

function genericGraph(task: Task): ComponentGraph {
  const noun = shortIntentLabel(task.intent);

  return {
    components: [
      {
        id: 'interface',
        goal: `Define the public interface and wiring points for ${noun}.`,
        contract: {
          entry: 'documented component interface'
        },
        strategy: 'assign'
      },
      {
        id: 'implementation',
        goal: `Build the main interchangeable implementation for ${noun}.`,
        contract: {
          produces: ['dist/implementation']
        },
        strategy: 'race',
        variants: 2
      },
      {
        id: 'verification',
        goal: `Verify the selected implementation for ${noun}.`,
        contract: {
          consumes: ['dist/implementation'],
          entry: 'verification report'
        },
        strategy: 'assign'
      }
    ],
    candidates: []
  };
}

function normalizeGraph(value: unknown): ComponentGraph | undefined {
  const parsed = ComponentGraphSchema.safeParse(value);

  if (!parsed.success) {
    return undefined;
  }

  const seen = new Map<string, number>();
  const components: ComponentSpec[] = parsed.data.components.map((component) => {
    const id = uniqueId(sanitizeId(component.id), seen);
    const normalized: Omit<ComponentSpec, 'variants'> = {
      id,
      goal: component.goal.trim(),
      contract: normalizeContract(component.contract),
      strategy: component.strategy
    };

    return component.strategy === 'race'
      ? { ...normalized, variants: Math.max(2, component.variants ?? 2) }
      : normalized;
  });

  const graph: ComponentGraphInput = { components, candidates: [] };
  const reparsed = ComponentGraphSchema.safeParse(graph);

  return reparsed.success ? { components, candidates: [] } : undefined;
}

function normalizeContract(contract: ComponentGraphInput['components'][number]['contract']): InterfaceContract {
  const normalized: InterfaceContract = {};

  if (contract.produces?.length) {
    normalized.produces = uniqueStrings(contract.produces);
  }

  if (contract.consumes?.length) {
    normalized.consumes = uniqueStrings(contract.consumes);
  }

  if (contract.entry) {
    normalized.entry = contract.entry.trim();
  }

  return normalized;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueId(id: string, seen: Map<string, number>): string {
  const count = seen.get(id) ?? 0;
  seen.set(id, count + 1);

  return count === 0 ? id : `${id}-${count + 1}`;
}

function sanitizeId(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return sanitized || 'component';
}

function isThreeDimensionalWebsite(intent: string): boolean {
  const lower = intent.toLowerCase();
  return (
    (lower.includes('3d') || lower.includes('three') || lower.includes('model')) &&
    (lower.includes('website') || lower.includes('site') || lower.includes('web'))
  );
}

function shortIntentLabel(intent: string): string {
  return intent.trim().replace(/\s+/g, ' ').slice(0, 80) || 'the requested feature';
}

function extractText(response: unknown): string {
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

function parseJsonObject(text: string): Record<string, unknown> {
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
      reject(new Error(`Decompose model timed out after ${DECOMPOSE_TIMEOUT_MS}ms`));
    }, DECOMPOSE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
