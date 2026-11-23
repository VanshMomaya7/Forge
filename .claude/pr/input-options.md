## Summary

Adds two new ways to feed Forge an intent besides typing it (audio and documents, usable from the cockpit), and hardens the cockpit backend.

- **`@forge/audio-input`** (`packages/audio_input`): `transcribeAudio(path)` turns a `.wav`/`.mp3` file (≤ 25 MB) into text with OpenAI's hosted transcription (`gpt-4o-mini-transcribe`, override with `FORGE_STT_MODEL`).
- **`@forge/doc-ingest`** (`packages/doc_ingest`): `ingestDocument(path)` returns `{ text, images }` for:
  - TXT: read directly, no API call
  - PDF: the model reads the text layer and page images, including scanned pages
  - DOCX: text via mammoth, plus a vision-model description of each embedded image

  The model defaults to `gpt-4.1-mini`; override with `FORGE_DOC_MODEL`.
- Both modules reject empty files, unsupported formats and oversized files **before** making any API call.
- **Cockpit UI:** the intake bar now has **Audio** and **Document** buttons. The file is uploaded to `POST /api/extract/audio` or `POST /api/extract/document`. The extracted text, plus any image descriptions, fills the intent box so it can be reviewed before **Forge it**. Errors and progress show inline. Temp uploads are always deleted.

### Surfaces server hardening (`packages/surfaces/src/server/index.ts`)
- **Swarm size:** `/api/tasks/:id/swarm` caps `n` at 5 and rejects non-numeric values.
- **CORS:** only known cockpit origins are allowed (`FORGE_ALLOWED_ORIGINS`, default `127.0.0.1:5173` and `localhost:5173`). Other sites get `403`.
- **GitHub webhook:** signatures are now verified (`X-Hub-Signature-256`). ⚠️ Set `GITHUB_WEBHOOK_SECRET`, or the webhook answers `503`.
- **Telemetry watchers:** they used to stop as soon as the request closed; they now keep running until `DELETE /api/watch/:taskId`.
- **Mode validation:** `mode` (request body and `FORGE_TASK_MODE`) must be `race` or `compose`.
- **Failed runs:** the "blocked" task is now built from the latest task state, so steps recorded before the failure are kept.

### Docs
- README: added an "Input options" section, the module graph (Mermaid) and new config rows. These are additions only; no existing lines changed.
- `.claude/`: repo graph, agent briefs and research notes for speech-to-text and document extraction.

## Test plan
- [x] `pnpm build`
- [x] `pnpm test`: 15 files, 59 tests pass. New tests use fixture files in `test/fixtures/` and mock every OpenAI call, so they need no network.
- [x] `pnpm lint` is clean for all changed packages. The 4 existing `any` errors in `packages/surfaces/src/RocketGame.tsx` are unchanged and outside this PR.
- [x] Ran the server and checked by hand: a foreign origin gets `403`, a bad `mode` gets `400`, the webhook without a secret gets `503`.
- [x] Extract endpoints checked by hand: TXT returns its text; an empty WAV, an `.ogg` file and a PDF without a key each return a clear error; no temp files are left behind. The UI build (`vite build`) passes.
- [ ] Not yet run against the real OpenAI API with a live key.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
