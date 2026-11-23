import { DEFAULT_DOC_MODEL, type IngestOptions, type ResponsesClient } from './types.js';

export function resolveModel(opts: IngestOptions): string {
  return opts.model ?? process.env.FORGE_DOC_MODEL ?? DEFAULT_DOC_MODEL;
}

/** Return the injected client, or lazily construct a real OpenAI client. */
export async function resolveClient(opts: IngestOptions): Promise<ResponsesClient> {
  if (opts.client) return opts.client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('doc_ingest: OPENAI_API_KEY is required to ingest PDF/DOCX documents');
  }
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey }) as unknown as ResponsesClient;
}
