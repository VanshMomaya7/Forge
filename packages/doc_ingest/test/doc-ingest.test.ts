import { mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_PDF_BYTES, ingestDocument, type ResponsesClient } from '../src/index.js';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

/** Mocked OpenAI Responses client — no network. */
function mockClient(outputText: string) {
  const create = vi.fn(async (): Promise<{ output_text?: string }> => ({ output_text: outputText }));
  const client: ResponsesClient = { responses: { create } };
  return Object.assign(client, { create });
}

describe('doc_ingest fixtures', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the exact text of a TXT file', async () => {
    const client = mockClient('should not be used');
    const expected = await readFile(fixture('sample.txt'), 'utf8');

    const result = await ingestDocument(fixture('sample.txt'), { client });

    expect(result).toEqual({ text: expected, images: [] });
    expect(client.create).not.toHaveBeenCalled();
  });

  it('returns the text of a PDF', async () => {
    const client = mockClient('{"text":"Hello from Forge","images":[]}');

    const result = await ingestDocument(fixture('sample.pdf'), { client });

    expect(result).toEqual({ text: 'Hello from Forge', images: [] });
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('returns the text of a DOCX and describes its embedded image', async () => {
    const client = mockClient('A single red pixel.');

    const result = await ingestDocument(fixture('sample.docx'), { client });

    expect(result.text).toContain('Hello from a DOCX.');
    expect(result.text).toContain('Second paragraph.');
    expect(result.images).toEqual([{ source: 'image1.png', description: 'A single red pixel.' }]);
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('returns an image description for a PDF with an image', async () => {
    const client = mockClient(
      '{"text":"Quarterly chart","images":[{"source":"page 1","description":"A blue bar chart."}]}'
    );

    const result = await ingestDocument(fixture('with-image.pdf'), { client });

    expect(result.text).toBe('Quarterly chart');
    expect(result.images).toEqual([{ source: 'page 1', description: 'A blue bar chart.' }]);
  });

  it('describes DOCX images whose file extension is upper-case', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'doc-ingest-'));
    try {
      const zip = await JSZip.loadAsync(await readFile(fixture('sample.docx')));
      const png = await zip.file('word/media/image1.png')?.async('nodebuffer');
      zip.remove('word/media/image1.png');
      zip.file('word/media/image1.PNG', png ?? Buffer.alloc(0));
      const file = join(dir, 'upper.docx');
      await writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }));
      const client = mockClient('A single red pixel.');

      const result = await ingestDocument(file, { client });

      expect(result.images).toEqual([{ source: 'image1.PNG', description: 'A single red pixel.' }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a PDF over the PDF size limit without calling the API', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'doc-ingest-'));
    try {
      const file = join(dir, 'huge.pdf');
      await writeFile(file, '%PDF-1.4\n');
      await truncate(file, MAX_PDF_BYTES + 1);
      const client = mockClient('{"text":"","images":[]}');

      await expect(ingestDocument(file, { client })).rejects.toThrow(/exceeds the/);
      expect(client.create).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects an empty TXT file with a clear error', async () => {
    await expect(ingestDocument(fixture('empty.txt'), { client: mockClient('{}') })).rejects.toThrow(
      /empty/i
    );
  });

  it('rejects an empty PDF with a clear error without calling the API', async () => {
    const client = mockClient('{"text":"","images":[]}');

    await expect(ingestDocument(fixture('empty.pdf'), { client })).rejects.toThrow(/empty/i);
    expect(client.create).not.toHaveBeenCalled();
  });

  it('rejects an unsupported format (.mp3) with a clear error', async () => {
    await expect(ingestDocument(fixture('sample.mp3'), { client: mockClient('{}') })).rejects.toThrow(
      /unsupported file type "\.mp3"/
    );
  });

  it('rejects with a clear error when OPENAI_API_KEY is missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', undefined);

    await expect(ingestDocument(fixture('sample.pdf'))).rejects.toThrow(/OPENAI_API_KEY is required/);
  });
});
