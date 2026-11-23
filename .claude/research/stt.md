# Speech-to-text choice (packages/audio_input)

- Chosen: OpenAI hosted `gpt-4o-mini-transcribe` (override via `FORGE_STT_MODEL`). Same `openai` SDK and `OPENAI_API_KEY` Forge already uses; no local binaries or Python deps. Limits: `.wav`/`.mp3` only, 25 MB per file.
- Swap options later: `whisper-1` (same API, just change the model; supports more response formats/timestamps); local faster-whisper (Python, fully offline, needs a model download + sidecar process); Deepgram or AssemblyAI (real-time streaming transcription for live mic input).
- The `TranscriptionClient` structural type is the seam: any provider can be adapted behind it without touching callers.
