# Agent 3 — doc_ingest (document extraction)

Read `.claude/plan/step2-overview.md` first (rules + scaffold).

## Write `.claude/research/doc_extraction.md` first (short, ~40 lines)
Pipeline per type:
- **TXT** → read UTF-8 directly, no API call, `images: []`.
- **PDF** → OpenAI Responses API with `input_file` (base64 `data:application/pdf;base64,...`). Model sees text layer + page images, so scanned pages are OCR'd by the model. Prompt asks for JSON `{ text, images: [{ source, description }] }` (source like `page 3`).
- **DOCX** → `mammoth.extractRawText` for text; `jszip` to read `word/media/*` images; each image → vision call (`input_image` data URL) for a 1–2 sentence description; `source` = media filename.
- Limits & fallbacks: file size cap (PDF 32 MB API limit), unsupported extension → throw, non-JSON model output → treat whole output as text with `images: []`, skip non-raster media (emf/wmf).
- Model: `gpt-4.1-mini` default, override `FORGE_DOC_MODEL`.

## Build `packages/doc_ingest/`
- `package.json`: name `@forge/doc-ingest`, deps `"openai": "^6.42.0"`, `"mammoth": "^1.8.0"`, `"jszip": "^3.10.1"`.
- `tsconfig.json`: per scaffold.
- `src/index.ts` exports:
  ```ts
  export interface ExtractedImage { source: string; description: string }
  export interface IngestResult { text: string; images: ExtractedImage[] }
  export interface IngestOptions { model?: string; client?: ResponsesClient }
  export async function ingestDocument(filePath: string, opts?: IngestOptions): Promise<IngestResult>
  ```
  - `ResponsesClient` = minimal structural type `{ responses: { create(args: unknown): Promise<{ output_text?: string }> } }` for mocking.
  - Dispatch on extension (case-insensitive): `.txt` / `.pdf` / `.docx`; else throw.
  - No injected client (and not TXT) → require `OPENAI_API_KEY`, lazily import `openai`.
  - Keep helpers small and in `src/` (e.g. `pdf.ts`, `docx.ts`, `parse.ts`) if it helps.
- `test/ingest.test.ts` (vitest): temp TXT → text returned, images `[]`, client never called; temp fake `.pdf` bytes + mocked client returning `output_text` JSON `{"text":"Hello","images":[{"source":"page 1","description":"a chart"}]}` → result matches; `.xyz` → rejects.
