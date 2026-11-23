import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';

import {
  MAX_DOCX_BYTES,
  MAX_IMAGE_BYTES,
  type ExtractedImage,
  type IngestResult,
  type ResponsesClient
} from './types.js';

/** Raster formats the vision model accepts. EMF/WMF/SVG etc. are skipped. */
const IMAGE_MIME: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

const IMAGE_PROMPT =
  'Describe this image from a document in 1-2 plain sentences. Mention any visible text, data or labels. No preamble.';

export async function ingestDocx(
  filePath: string,
  client: ResponsesClient,
  model: string
): Promise<IngestResult> {
  const buffer = await readFile(filePath);
  if (buffer.byteLength > MAX_DOCX_BYTES) {
    throw new Error(
      `doc_ingest: DOCX is ${buffer.byteLength} bytes, exceeds the ${MAX_DOCX_BYTES}-byte limit`
    );
  }

  const { default: mammoth } = await import('mammoth');
  const { value: text } = await mammoth.extractRawText({ buffer });

  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);

  const mediaNames = Object.keys(zip.files)
    .filter((name) => name.startsWith('word/media/') && !zip.files[name]?.dir)
    .sort();

  const images: ExtractedImage[] = [];
  for (const name of mediaNames) {
    const mime = IMAGE_MIME[posix.extname(name)];
    const entry = zip.file(name);
    if (!mime || !entry) continue;

    const data = await entry.async('nodebuffer');
    if (data.byteLength === 0 || data.byteLength > MAX_IMAGE_BYTES) continue;

    const description = await describeImage(client, model, mime, data);
    if (description) {
      images.push({ source: posix.basename(name), description });
    }
  }

  return { text: text.trim(), images };
}

async function describeImage(
  client: ResponsesClient,
  model: string,
  mime: string,
  data: Buffer
): Promise<string> {
  const response = await client.responses.create({
    model,
    temperature: 0,
    max_output_tokens: 200,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: IMAGE_PROMPT },
          {
            type: 'input_image',
            image_url: `data:${mime};base64,${data.toString('base64')}`,
            detail: 'auto'
          }
        ]
      }
    ]
  });
  return (response.output_text ?? '').trim();
}
