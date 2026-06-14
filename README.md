# Forge

Forge is an autonomous software org prototype: one plain-English task fans out to parallel Codex agents, streams every step through a shared bus, gates progress with evals, and promotes the best result.

## Packages

- `shared/` contains the frozen Task contract.
- `packages/core/` owns the agent runtime, task store, event bus, and orchestrator.

## Scripts

- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `pnpm dev`
