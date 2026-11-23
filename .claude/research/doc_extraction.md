# Document extraction (`@forge/doc-ingest`)

Goal: turn an uploaded document into `{ text, images: [{ source, description }] }`
so it can later feed `/api/intake` alongside a typed intent. Standalone for now.

## Pipeline per type (dispatch on lowercase extension)

**TXT**: `readFile(path, 'utf8')`, returned as-is with `images: []`. No API call and
no API key needed.

**PDF**: one OpenAI Responses API call, with the file sent inline as
`{ type: 'input_file', filename, file_data: 'data:application/pdf;base64,...' }`
plus an `input_text` prompt. For PDFs the API gives the model both the extracted
text layer and an image of each page, so scanned or image-only pages are read
by the model itself (no separate OCR step). The prompt asks for JSON only:
`{ "text": string, "images": [{ "source": "page N", "description": "1-2 sentences" }] }`.

**DOCX**:
- Text: `mammoth.extractRawText({ buffer })`. It drops formatting and keeps paragraph breaks.
- Images: open the same buffer with `jszip` and enumerate `word/media/*`.
  Each raster image (png/jpg/jpeg/gif/webp) gets one vision call
  (`input_image` with a `data:<mime>;base64,...` URL) asking for a 1-2
  sentence description. `source` is the media filename (e.g. `image1.png`).
  Images are handled one at a time to keep rate-limit pressure low.

## Limits & fallbacks
- PDF: 32 MB cap (the OpenAI file-input limit). Larger files throw before any upload.
- DOCX: 50 MB cap on the file. Embedded images over 20 MB, or empty ones, are skipped.
- Non-raster media (emf, wmf, svg, tiff, ...) is skipped because the vision input won't accept it.
- Unsupported extension: throws `unsupported file type`.
- Model output that isn't valid `{ text, images }` JSON (after stripping an
  optional ```json fence) is kept as plain text: the whole output becomes `text`
  and `images` is `[]`. Malformed image entries are dropped one by one.
- No injected client and no `OPENAI_API_KEY` (PDF/DOCX only): throws a clear error.
  `openai` is imported lazily, so TXT ingest never loads the SDK.

## Model
`gpt-4.1-mini` by default (vision- and file-capable, matches evals/decompose).
Override with `opts.model` or the `FORGE_DOC_MODEL` env var. `temperature: 0`.

## Testing
A `ResponsesClient` (structural `{ responses: { create } }`) is injected in tests,
so no test hits the network. The DOCX path is not covered by a unit test yet,
because building a fixture .docx at test time needs jszip. That's a possible follow-up.
