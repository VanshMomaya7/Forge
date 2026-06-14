# Forge

Forge is an autonomous software org prototype: one plain-English task fans out to parallel Codex agents, streams every step through a shared bus, gates progress with evals, and promotes the best result.

## Packages

- `shared/` contains the frozen Task contract.
- `packages/core/` owns the agent runtime, task store, event bus, and orchestrator.

## Scripts

- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `pnpm dev` or `pnpm demo`

## Core Demo

Run the stubbed swarm locally:

```bash
pnpm demo
```

The demo starts the WebSocket task bus, runs `forkAndRun(task, 3)`, streams `task.updated` events, promotes one winner, and removes the demo winner worktree unless `FORGE_KEEP_DEMO_WORKTREE=1` is set.

To use the real Codex App Server runner instead of the stub:

```bash
USE_REAL_CODEX=1 CODEX_SQLITE_HOME=.codex-runtime/sqlite pnpm demo
```

On Windows PowerShell:

```powershell
$env:USE_REAL_CODEX='1'
$env:CODEX_SQLITE_HOME=(Resolve-Path .\.codex-runtime\sqlite).Path
pnpm demo
```

`CODEX_SQLITE_HOME` must point to a writable directory in sandboxed environments.
