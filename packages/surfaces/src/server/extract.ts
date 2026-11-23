import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { transcribeAudio } from "@forge/audio-input";
import { ingestDocument } from "@forge/doc-ingest";
import express from "express";

// Upload endpoints that turn an audio clip or a document into intent text.
// The browser sends the raw file bytes with its name in X-File-Name; we only
// keep the extension, write the bytes to a private temp dir, run the module,
// and always delete the temp dir afterwards.
export const extractRouter = express.Router();

const rawBody = express.raw({ type: "*/*", limit: "50mb" });

extractRouter.post("/api/extract/audio", rawBody, async (request, response) => {
  await withUpload(request, response, async (filePath) => ({
    text: await transcribeAudio(filePath),
    images: [],
  }));
});

extractRouter.post("/api/extract/document", rawBody, async (request, response) => {
  await withUpload(request, response, (filePath) => ingestDocument(filePath));
});

async function withUpload(
  request: express.Request,
  response: express.Response,
  run: (filePath: string) => Promise<{ text: string; images: unknown[] }>,
): Promise<void> {
  // An empty upload leaves no Buffer; pass 0 bytes through so the module's
  // own empty-file check answers it.
  const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
  const fileName = String(request.header("x-file-name") ?? "");
  const ext = path.extname(path.basename(fileName)).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const dir = await mkdtemp(path.join(tmpdir(), "forge-extract-"));
  const filePath = path.join(dir, `upload${ext}`);
  try {
    await writeFile(filePath, body);
    response.json(await run(filePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Show the user's file name in errors, not our temp path.
    response.status(400).json({ error: message.split(filePath).join(fileName || "file") });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
