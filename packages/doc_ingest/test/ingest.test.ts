import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ingestDocument, parseIngestOutput, type ResponsesClient } from '../src/index.js';

function mockClient(outputText: string) {
  const create = vi.fn(async (): Promise<{ output_text?: string }> => ({
    output_text: outputText
  }));
  const client: ResponsesClient = { responses: { create } };
  return Object.assign(client, { create });
}

describe('ingestDocument', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'doc-ingest-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads TXT directly without calling the model', async () => {
    const file = join(dir, 'notes.TXT');
    await writeFile(file, 'plain text body\nline two', 'utf8');
    const client = mockClient('should not be used');

    const result = await ingestDocument(file, { client });

    expect(result).toEqual({ text: 'plain text body\nline two', images: [] });
    expect(client.create).not.toHaveBeenCalled();
  });

  it('sends PDFs to the Responses API and parses the JSON output', async () => {
    const file = join(dir, 'report.pdf');
    await writeFile(file, Buffer.from('%PDF-1.4\n% fake pdf bytes\n'));
    const client = mockClient(
      '{"text":"Hello","images":[{"source":"page 1","description":"a chart"}]}'
    );

    const result = await ingestDocument(file, { client, model: 'test-model' });

    expect(result).toEqual({
      text: 'Hello',
      images: [{ source: 'page 1', description: 'a chart' }]
    });
    expect(client.create).toHaveBeenCalledTimes(1);
    const args = client.create.mock.calls[0]?.[0] as {
      model: string;
      input: Array<{ content: Array<{ type: string; file_data?: string }> }>;
    };
    expect(args.model).toBe('test-model');
    const filePart = args.input[0]?.content.find((part) => part.type === 'input_file');
    expect(filePart?.file_data?.startsWith('data:application/pdf;base64,')).toBe(true);
  });

  it('rejects unsupported extensions', async () => {
    const file = join(dir, 'data.xyz');
    await writeFile(file, 'whatever', 'utf8');

    await expect(ingestDocument(file, { client: mockClient('{}') })).rejects.toThrow(
      /unsupported file type/
    );
  });
});

describe('parseIngestOutput', () => {
  it('falls back to raw text when output is not JSON', () => {
    expect(parseIngestOutput('just some text')).toEqual({ text: 'just some text', images: [] });
  });

  it('accepts fenced JSON', () => {
    expect(parseIngestOutput('```json\n{"text":"A","images":[]}\n```')).toEqual({
      text: 'A',
      images: []
    });
  });
});
