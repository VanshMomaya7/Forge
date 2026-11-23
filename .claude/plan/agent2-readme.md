# Agent 2 — README.md (additions only)

Read `.claude/plan/step2-overview.md` first. Edit ONLY `README.md`. **Do not rewrite, reword, or delete any existing line** — only insert new lines. `git diff -- README.md` must show additions only.

## Insertions
1. In the `## 🏗️ Architecture` section, right after the existing `forge/` tree code block, add a `### Module graph` subsection containing the Mermaid `flowchart TD` block copied verbatim from `.claude/repo-graph.md`.
2. In that same existing `forge/` tree, insert lines (additions only) for:
   ```
   ├── packages/audio_input/       # 🎙️ audio (wav/mp3) → text via OpenAI transcription
   ├── packages/doc_ingest/        # 📄 PDF/DOCX/TXT → text + image descriptions via OpenAI
   ```
   placed before the `packages/surfaces/` entry.
3. New section `## 🎤 Input options` placed right before `## 🚀 Quickstart`:
   - **Text** — the cockpit intent box → `POST /api/intake` (current path).
   - **Audio** — `@forge/audio-input` → `transcribeAudio(path): Promise<string>`; `.wav`/`.mp3`, ≤25 MB, needs `OPENAI_API_KEY`; model override `FORGE_STT_MODEL`.
   - **Documents** — `@forge/doc-ingest` → `ingestDocument(path): Promise<{ text, images: { source, description }[] }>`; PDF (incl. scanned pages, read by the model), DOCX (text + embedded images described), TXT; needs `OPENAI_API_KEY`.
   - Short code example for each of audio + docs.
   - Note: audio and documents are standalone modules, **not yet wired into `/api/intake`** — transcribe/ingest, then submit the text as an intent.
4. Add `FORGE_STT_MODEL` and `FORGE_DOC_MODEL` rows at the end of the existing Configuration table.
