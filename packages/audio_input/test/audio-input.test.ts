import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { transcribeAudio, type TranscriptionClient, type TranscriptionCreateArgs } from '../src/index.js';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

/** Mocked OpenAI transcription client — no network. */
function mockClient(result: string | Error) {
  const create = vi.fn(async (args: TranscriptionCreateArgs): Promise<{ text: string }> => {
    args.file.destroy();
    if (result instanceof Error) throw result;
    return { text: result };
  });
  const client: TranscriptionClient = { audio: { transcriptions: { create } } };
  return Object.assign(client, { create });
}

describe('audio_input fixtures', () => {
  it('transcribes a valid wav file to non-empty text', async () => {
    const client = mockClient('  the quick brown fox  ');

    const text = await transcribeAudio(fixture('sample.wav'), { client });

    expect(text).toBe('the quick brown fox');
    expect(text.length).toBeGreaterThan(0);
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('transcribes a valid mp3 file', async () => {
    const client = mockClient('hello from an mp3');

    await expect(transcribeAudio(fixture('sample.mp3'), { client })).resolves.toBe('hello from an mp3');
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty audio file with a clear error', async () => {
    const client = mockClient('should not be reached');

    await expect(transcribeAudio(fixture('empty.wav'), { client })).rejects.toThrow(/empty/i);
    expect(client.create).not.toHaveBeenCalled();
  });

  it('rejects an unsupported format (.txt) with a clear error', async () => {
    const client = mockClient('should not be reached');

    await expect(transcribeAudio(fixture('notes.txt'), { client })).rejects.toThrow(
      /unsupported audio format "\.txt"/
    );
    expect(client.create).not.toHaveBeenCalled();
  });

  it('surfaces a transcription failure as a rejected promise, not a crash', async () => {
    const client = mockClient(new Error('429 Rate limit reached'));

    await expect(transcribeAudio(fixture('sample.wav'), { client })).rejects.toThrow(/Rate limit/);
    expect(client.create).toHaveBeenCalledTimes(1);
  });
});
