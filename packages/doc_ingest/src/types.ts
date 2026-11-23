export interface ExtractedImage {
  /** Where the image came from, e.g. `page 3` (PDF) or `image1.png` (DOCX media file). */
  source: string;
  /** Short natural-language description of the image. */
  description: string;
}

export interface IngestResult {
  text: string;
  images: ExtractedImage[];
}

/**
 * Minimal structural slice of the OpenAI SDK client that this package uses.
 * Lets tests inject a mock without touching the network.
 */
export interface ResponsesClient {
  responses: {
    create(args: unknown): Promise<{ output_text?: string }>;
  };
}

export interface IngestOptions {
  /** Model id; defaults to `FORGE_DOC_MODEL` or `gpt-4.1-mini`. */
  model?: string;
  /** Injected client (for tests). When absent, a real OpenAI client is created lazily. */
  client?: ResponsesClient;
}

export const DEFAULT_DOC_MODEL = 'gpt-4.1-mini';

/** OpenAI file-input limit for PDFs. */
export const MAX_PDF_BYTES = 32 * 1024 * 1024;

/** Upper bound for a single DOCX file we are willing to load. */
export const MAX_DOCX_BYTES = 50 * 1024 * 1024;

/** Upper bound for a single embedded image sent to the vision model. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
