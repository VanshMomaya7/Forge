import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { transcribeAudio, type TranscriptionClient, type TranscriptionCreateArgs } from '../src/index.js';

function makeClient(text: string): TranscriptionClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    audio: {
      transcriptions: {
        create: vi.fn(async (args: TranscriptionCreateArgs) => {
          calls.push(args);
          args.file.destroy();
          return { text };
        }),
      },
    },
  };
}

/** 44-byte PCM WAV header with zero samples. */
function tinyWav(): Buffer {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(16000, 24);
  buf.writeUInt32LE(32000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(0, 40);
  return buf;
}

describe('transcribeAudio', () => {
  let dir: string;
  let wavPath: string;
  let oggPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'forge-stt-'));
    wavPath = join(dir, 'clip.WAV');
    oggPath = join(dir, 'clip.ogg');
    await writeFile(wavPath, tinyWav());
    await writeFile(oggPath, Buffer.from('OggS'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns trimmed text from the injected client', async () => {
    const client = makeClient(' hello ');
    await expect(transcribeAudio(wavPath, { client, model: 'test-model', language: 'en' })).resolves.toBe('hello');
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toMatchObject({ model: 'test-model', language: 'en' });
  });

  it('rejects unsupported extensions', async () => {
    const client = makeClient('nope');
    await expect(transcribeAudio(oggPath, { client })).rejects.toThrow(/unsupported audio format/);
    expect(client.calls).toHaveLength(0);
  });

  it('rejects missing files', async () => {
    const client = makeClient('nope');
    await expect(transcribeAudio(join(dir, 'missing.mp3'), { client })).rejects.toThrow(/cannot read audio file/);
  });
});
