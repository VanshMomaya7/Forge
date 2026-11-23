import type { ExtractedImage, IngestResult } from './types.js';

/** Strip an optional ```json ... ``` fence around model output. */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseImages(value: unknown): ExtractedImage[] {
  if (!Array.isArray(value)) return [];
  const images: ExtractedImage[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const { source, description } = item;
    if (typeof description !== 'string' || description.trim() === '') continue;
    images.push({
      source: typeof source === 'string' && source.trim() !== '' ? source : 'unknown',
      description: description.trim()
    });
  }
  return images;
}

/**
 * Parse the model's `{ text, images }` JSON. Anything that isn't valid JSON of
 * that shape falls back to treating the whole output as text with no images.
 */
export function parseIngestOutput(raw: string | undefined): IngestResult {
  const output = raw ?? '';
  const body = stripFence(output);
  try {
    const json: unknown = JSON.parse(body);
    if (isRecord(json) && typeof json.text === 'string') {
      return { text: json.text, images: parseImages(json.images) };
    }
  } catch {
    // fall through to plain-text fallback
  }
  return { text: output.trim(), images: [] };
}
