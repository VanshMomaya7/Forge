# Step 2 — Input options (branch: feature/input-options)

Goal: add two standalone input modules (audio → text, documents → text + image descriptions) and document them in README.md. Not wired into `/api/intake` yet.

Reference: `.claude/repo-graph.md` (architecture + file tree). Do not re-explore the repo.

## Ownership (write ONLY to your own paths)
| Agent | Owns |
|---|---|
| 1 STT | `packages/audio_input/**`, `.claude/research/stt.md` |
| 2 README | `README.md` (additions only) |
| 3 Doc ingest | `packages/doc_ingest/**`, `.claude/research/doc_extraction.md` |

## Rules for all agents
- No `pnpm install`, no edits to root `package.json` / `tsconfig.json` / `pnpm-lock.yaml`, no commits, no git commands that change state.
- Tests never hit the network: inject a mocked OpenAI client.
- TypeScript, ESM, NodeNext (`.js` suffix on relative imports), strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` (root tsconfig).
- OpenAI pattern: `const { default: OpenAI } = await import('openai'); new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` (see `packages/evals/src/model-judge.ts`).
- Finish with a short report: files written, exported API.

## Package scaffold (agents 1 & 3)
`package.json` modeled on `packages/evals/package.json`: `"private": true`, `"type": "module"`, `exports` → `./dist/index.js` / `./dist/index.d.ts`, scripts `build: tsc -b`, `test: vitest run`.
`tsconfig.json` modeled on `packages/evals/tsconfig.json` (extends `../../tsconfig.json`, composite, outDir dist, rootDir src, include `src/**/*.ts`), no references needed.
Tests live in `test/*.test.ts` and import from `../src/index.js` (root vitest picks them up).

## Integration (orchestrator, after agents)
`pnpm install`; add both packages to root `tsconfig.json` references; `pnpm build && pnpm test && pnpm lint`; commit on branch.
