import { createReadStream, type ReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';

/** Default hosted speech-to-text model; override with FORGE_STT_MODEL or opts.model. */
export const DEFAULT_STT_MODEL = 'gpt-4o-mini-transcribe';

/** OpenAI's upload limit for the transcription endpoint (25 MB). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** File extensions accepted by transcribeAudio (compared case-insensitively). */
export const SUPPORTED_AUDIO_EXTENSIONS = ['.wav', '.mp3'] as const;

export interface TranscriptionCreateArgs {
  file: ReadStream;
  model: string;
  language?: string;
}

/**
 * Minimal structural slice of the OpenAI client used for transcription,
 * so tests (or alternate providers) can inject a mock.
 */
export interface TranscriptionClient {
  audio: {
    transcriptions: {
      create(args: TranscriptionCreateArgs): Promise<{ text: string }>;
    };
  };
}

export interface TranscribeOptions {
  model?: string;
  language?: string;
  client?: TranscriptionClient;
}

async function createOpenAIClient(): Promise<TranscriptionClient> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'transcribeAudio: OPENAI_API_KEY is not set. Set it in the environment or pass opts.client.',
    );
  }
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey });
  return {
    audio: {
      transcriptions: {
        async create(args: TranscriptionCreateArgs): Promise<{ text: string }> {
          const result = await openai.audio.transcriptions.create({
            file: args.file,
            model: args.model,
            ...(args.language !== undefined ? { language: args.language } : {}),
          });
          return { text: result.text };
        },
      },
    },
  };
}

/**
 * Transcribe a local .wav or .mp3 file to text using OpenAI hosted STT.
 * Throws on unsupported extension, missing file, files over 25 MB,
 * or (when no client is injected) a missing OPENAI_API_KEY.
 */
export async function transcribeAudio(filePath: string, opts: TranscribeOptions = {}): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  if (!(SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(
      `transcribeAudio: unsupported audio format "${ext || '(none)'}"; expected one of ${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}`,
    );
  }

  let size: number;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new Error('not a regular file');
    }
    size = info.size;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`transcribeAudio: cannot read audio file "${filePath}": ${reason}`);
  }
  if (size === 0) {
    throw new Error(`transcribeAudio: "${filePath}" is empty (0 bytes); nothing to transcribe`);
  }
  if (size > MAX_AUDIO_BYTES) {
    throw new Error(
      `transcribeAudio: "${filePath}" is ${size} bytes, over the 25 MB transcription limit (${MAX_AUDIO_BYTES} bytes)`,
    );
  }

  const model = opts.model ?? process.env.FORGE_STT_MODEL ?? DEFAULT_STT_MODEL;
  const client = opts.client ?? (await createOpenAIClient());

  const result = await client.audio.transcriptions.create({
    file: createReadStream(filePath),
    model,
    ...(opts.language !== undefined ? { language: opts.language } : {}),
  });
  return result.text.trim();
}
