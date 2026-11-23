import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

import { resolveClient, resolveModel } from './client.js';
import { ingestDocx } from './docx.js';
import { ingestPdf } from './pdf.js';
import type { IngestOptions, IngestResult } from './types.js';

export type { ExtractedImage, IngestOptions, IngestResult, ResponsesClient } from './types.js';
export { DEFAULT_DOC_MODEL, MAX_PDF_BYTES } from './types.js';
export { parseIngestOutput } from './parse.js';

export const SUPPORTED_EXTENSIONS = ['.txt', '.pdf', '.docx'] as const;

/**
 * Extract text and image descriptions from a document.
 *
 * - `.txt`  → read as UTF-8, no model call.
 * - `.pdf`  → OpenAI Responses API with the PDF as `input_file` (text + OCR + figures).
 * - `.docx` → mammoth raw text, plus a vision call per raster image in `word/media/`.
 *
 * Any other extension throws.
 */
export async function ingestDocument(
  filePath: string,
  opts: IngestOptions = {}
): Promise<IngestResult> {
  const ext = extname(filePath).toLowerCase();

  // Fail fast on empty files so we never spend an API call on them.
  if ((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    const { size } = await stat(filePath);
    if (size === 0) {
      throw new Error(`doc_ingest: "${filePath}" is empty (0 bytes); nothing to ingest`);
    }
  }

  switch (ext) {
    case '.txt': {
      const text = await readFile(filePath, 'utf8');
      return { text, images: [] };
    }
    case '.pdf': {
      const client = await resolveClient(opts);
      return ingestPdf(filePath, client, resolveModel(opts));
    }
    case '.docx': {
      const client = await resolveClient(opts);
      return ingestDocx(filePath, client, resolveModel(opts));
    }
    default:
      throw new Error(
        `doc_ingest: unsupported file type "${ext || '(none)'}" — expected one of ${SUPPORTED_EXTENSIONS.join(', ')}`
      );
  }
}
