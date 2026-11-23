import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { parseIngestOutput } from './parse.js';
import { MAX_DOCX_BYTES, MAX_PDF_BYTES, type IngestResult, type ResponsesClient } from './types.js';

const PDF_PROMPT = [
  'Extract the full content of the attached PDF.',
  'Return ONLY a JSON object of the form',
  '{ "text": string, "images": [{ "source": string, "description": string }] }.',
  '"text": all readable text in reading order, including text from scanned pages (OCR them).',
  '"images": one entry per meaningful figure, chart, photo or diagram;',
  '"source" is its location like "page 3", "description" is 1-2 sentences.',
  'Use an empty array when there are no images. No commentary, no markdown fences.'
].join(' ');

export async function ingestPdf(
  filePath: string,
  client: ResponsesClient,
  model: string
): Promise<IngestResult> {
  const bytes = await readFile(filePath);
  if (bytes.byteLength > MAX_DOCX_BYTES) {
    throw new Error(
      `doc_ingest: PDF is ${bytes.byteLength} bytes, exceeds the ${MAX_PDF_BYTES}-byte limit`
    );
  }

  const response = await client.responses.create({
    model,
    temperature: 0,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: basename(filePath),
            file_data: `data:application/pdf;base64,${bytes.toString('base64')}`
          },
          { type: 'input_text', text: PDF_PROMPT }
        ]
      }
    ]
  });

  return parseIngestOutput(response.output_text);
}
