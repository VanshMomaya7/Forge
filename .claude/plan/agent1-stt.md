# Agent 1 — audio_input (speech-to-text)

Read `.claude/plan/step2-overview.md` first (rules + scaffold). No research phase: decision is OpenAI hosted transcription for now.

## Build `packages/audio_input/`
- `package.json`: name `@forge/audio-input`, dependency `"openai": "^6.42.0"`.
- `tsconfig.json`: per scaffold.
- `src/index.ts` exports:
  ```ts
  export interface TranscribeOptions { model?: string; language?: string; client?: TranscriptionClient }
  export async function transcribeAudio(filePath: string, opts?: TranscribeOptions): Promise<string>
  ```
  - `TranscriptionClient` = minimal structural type: `{ audio: { transcriptions: { create(args: {...}): Promise<{ text: string }> } } }` so tests can mock it.
  - Accept only `.wav` / `.mp3` (case-insensitive) → else throw.
  - File must exist; enforce 25 MB API limit → else throw.
  - Default model `gpt-4o-mini-transcribe` (env override `FORGE_STT_MODEL`).
  - No injected client → require `OPENAI_API_KEY` (throw clear error if missing), lazily import `openai`.
  - Call `client.audio.transcriptions.create({ file: fs.createReadStream(filePath), model, language? })`, return trimmed `text`.
- `test/transcribe.test.ts` (vitest): write a tiny temp `.wav` file in `os.tmpdir()`; mocked client returns `{ text: ' hello ' }` → expect `'hello'`; unsupported `.ogg` → rejects.

## Write `.claude/research/stt.md`
3–6 lines: chosen = OpenAI `gpt-4o-mini-transcribe` (same SDK/key as Forge, no local deps); swap later to `whisper-1`, local faster-whisper (Python, offline), or Deepgram/AssemblyAI (streaming).
