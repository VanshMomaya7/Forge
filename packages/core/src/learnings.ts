import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ComponentCandidate, ComponentGraph } from '@forge/shared/component';
import type { Learning } from '@forge/shared/learning';
import type { Task } from '@forge/shared/task';

const RETRIEVE_LIMIT = 3;
const JUDGE_MODEL = 'gpt-4.1-mini';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'build', 'me', 'using', 'with', 'for', 'and', 'to', 'of',
  'in', 'on', 'make', 'create', 'that', 'this', 'is', 'be', 'it'
]);

let cache: Learning[] | undefined;
let cachePath: string | undefined;

/**
 * The write path, step 1: at the merge boundary (after selectBest), compact
 * each losing variant's outcome into a candidate (unverified) Learning. Only
 * components that actually raced (>=2 candidates) produce anything — a
 * winner has nothing to be compared against.
 */
export async function harvestComponentLearnings(
  task: Task,
  graph: ComponentGraph,
  selected: ComponentCandidate[]
): Promise<void> {
  const selectedKeys = new Set(selected.map(candidateKey));
  const byComponent = new Map<string, ComponentCandidate[]>();

  for (const candidate of graph.candidates) {
    const list = byComponent.get(candidate.componentId) ?? [];
    list.push(candidate);
    byComponent.set(candidate.componentId, list);
  }

  const learnings = await load(task);
  let changed = false;

  for (const [componentId, candidates] of byComponent) {
    if (candidates.length < 2) continue;
    const winner = candidates.find((candidate) => selectedKeys.has(candidateKey(candidate)));
    if (!winner) continue;

    for (const loser of candidates) {
      if (selectedKeys.has(candidateKey(loser))) continue;

      const insight = await compactInsight(componentId, loser, winner);
      if (!insight) continue;

      learnings.push({
        id: `${task.id}:${sanitize(loser.variantId)}:${Date.now().toString(36)}`,
        insight,
        sourceTaskId: task.id,
        sourceBranch: loser.variantId,
        status: 'candidate',
        tags: tagsFor(task, componentId),
        createdAt: Date.now()
      });
      changed = true;
    }
  }

  if (changed) {
    await persist(task, learnings);
  }
}

/**
 * The write path, step 2: only after the integration/site gate verifies the
 * assembled whole do this task's candidate learnings become durable. A
 * failed gate leaves them as unverified scratch — never promoted, per the
 * "gate the learnings exactly like you gate the code" rule.
 */
export async function promoteTaskLearnings(task: Task, verifiedBy: string): Promise<number> {
  const learnings = await load(task);
  let promoted = 0;

  for (const learning of learnings) {
    if (learning.sourceTaskId === task.id && learning.status === 'candidate') {
      learning.status = 'verified';
      learning.verifiedBy = verifiedBy;
      promoted += 1;
    }
  }

  if (promoted > 0) {
    await persist(task, learnings);
  }

  return promoted;
}

/**
 * The read path: retrieve prior verified learnings relevant to this task's
 * intent (tag/keyword overlap — a thin, dependency-free stand-in for RAG)
 * so decompose/build can seed agents with earned priors instead of starting
 * from zero every run.
 */
export async function retrieveVerifiedLearnings(task: Task, limit = RETRIEVE_LIMIT): Promise<Learning[]> {
  const learnings = await load(task);
  const queryTags = new Set(tagsFor(task));
  const verified = learnings.filter(
    (learning) => learning.status === 'verified' && learning.sourceTaskId !== task.id
  );

  return verified
    .map((learning) => ({ learning, score: overlap(queryTags, learning.tags) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.learning.createdAt - a.learning.createdAt)
    .slice(0, limit)
    .map((entry) => entry.learning);
}

async function compactInsight(
  componentId: string,
  loser: ComponentCandidate,
  winner: ComponentCandidate
): Promise<string | undefined> {
  const lastNote = [...loser.steps].reverse().find((step) => step.scores?.notes)?.scores?.notes;
  const heuristic = buildHeuristicInsight(componentId, loser, winner, lastNote);

  if (process.env.FORGE_EVALS_USE_MODEL !== '1' || !process.env.OPENAI_API_KEY) {
    return heuristic;
  }

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.FORGE_EVALS_JUDGE_MODEL ?? JUDGE_MODEL,
      temperature: 0,
      max_output_tokens: 120,
      input: [
        {
          role: 'system',
          content:
            'Compact the following into ONE crisp, reusable engineering insight sentence (under 160 characters). Return only the sentence, no preamble or quotes.'
        },
        { role: 'user', content: heuristic }
      ]
    } as never);
    const text = extractText(response).trim();
    return text.length > 0 ? text.slice(0, 280) : heuristic;
  } catch {
    return heuristic;
  }
}

function buildHeuristicInsight(
  componentId: string,
  loser: ComponentCandidate,
  winner: ComponentCandidate,
  note?: string
): string {
  if (note) {
    return `${componentId}: ${note}`.slice(0, 280);
  }

  const loserScore = loser.score?.overall;
  const winnerScore = winner.score?.overall;
  const delta =
    typeof loserScore === 'number' && typeof winnerScore === 'number'
      ? ` (${loserScore.toFixed(2)} vs ${winnerScore.toFixed(2)})`
      : '';

  return (
    `${componentId}: "${loser.variantId}" scored lower than "${winner.variantId}"${delta} — ` +
    'inspect its approach before reusing it.'
  ).slice(0, 280);
}

function tagsFor(task: Task, componentId?: string): string[] {
  const words = task.intent
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  const tags = new Set(words);

  if (componentId) {
    tags.add(componentId);
  }

  return [...tags];
}

function overlap(query: Set<string>, tags: string[]): number {
  let count = 0;
  for (const tag of tags) {
    if (query.has(tag)) {
      count += 1;
    }
  }
  return count;
}

async function load(task: Task): Promise<Learning[]> {
  const file = resolvePath(task);

  if (cache && cachePath === file) {
    return cache;
  }

  try {
    const raw = await readFile(file, 'utf8');
    cache = JSON.parse(raw) as Learning[];
  } catch {
    cache = [];
  }

  cachePath = file;
  return cache;
}

async function persist(task: Task, learnings: Learning[]): Promise<void> {
  const file = resolvePath(task);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(learnings, null, 2)}\n`, 'utf8');
  cache = learnings;
  cachePath = file;
}

function resolvePath(task: Task): string {
  if (process.env.FORGE_LEARNINGS_PATH) {
    return path.resolve(process.env.FORGE_LEARNINGS_PATH);
  }

  const repo = typeof task.context.repo === 'string' ? path.resolve(task.context.repo) : process.cwd();
  return path.join(repo, '.forge', 'learnings.json');
}

function candidateKey(candidate: Pick<ComponentCandidate, 'componentId' | 'variantId'>): string {
  return `${candidate.componentId}:${candidate.variantId}`;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 96);
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

  return '';
}
