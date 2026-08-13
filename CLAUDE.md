# CLAUDE.md — Forge setup & operating notes

This file is for whichever agent (Claude Code, Codex, or a human) is
picking up this repo on a machine where it hasn't run before. For what
Forge *is* and its architecture, read `README.md` first — this file is
purely "how do I get it running here."

## Prerequisites

- **Node.js 20+** (developed against 22.x)
- **pnpm**, pinned via `packageManager` in `package.json` — `corepack enable`
  picks up the right version automatically, or `npm i -g pnpm`
- **git** — required at runtime, not just for cloning: the compose pipeline
  creates real `git worktree`s per agent/variant while it runs
- **Codex CLI** — `npm i -g @openai/codex`, then run `codex login`
  interactively (ChatGPT account). This is a *separate* credential from the
  OpenAI API key below, and has to be done fresh on every machine — it is
  not something that travels with the repo.
- **An OpenAI API key**, if you want real model-backed decompose/eval
  (see `.env` below). Optional — without it the pipeline runs on
  deterministic heuristics/templates instead of GPT calls.

## First-time setup

```bash
git clone <this-repo> forge
cd forge
pnpm install
pnpm build      # tsc -b — REQUIRED before running anything. Packages import
                # each other via package.json "exports" pointing at dist/,
                # not source, so nothing resolves until this has run once.
```

Re-run `pnpm build` after pulling changes to `shared/`, `packages/core`,
`packages/compose`, or `packages/evals` — the dist output is stale otherwise
and you'll get confusing "it still does the old thing" behavior.

## `.env`

Gitignored, so it never arrives via clone — create `forge/.env` yourself:

```bash
OPENAI_API_KEY=sk-...

# Real GPT-4.1-mini paths instead of heuristic/template fallbacks:
FORGE_DECOMPOSE_USE_MODEL=1
FORGE_EVALS_USE_MODEL=1

# Real Codex CLI agents (writes real files in real git worktrees) instead
# of the fast stub build. Requires `codex login` to already be done.
USE_REAL_CODEX=1

# Windows ONLY: plain `codex` isn't directly spawnable (no .exe on PATH,
# only codex.cmd) — Node's spawn(shell:false) can't find it without this.
# Omit entirely on macOS/Linux.
CODEX_BIN=codex.cmd

# Left off on purpose: FORGE_DEPLOY=1 makes a successful run publish a real,
# public Codex Sites URL. Only set it when you actually want to ship.
```

Nothing reads this file automatically (no dotenv wired in) — load it into
the shell before starting the server, e.g. in bash:

```bash
set -a && source .env && set +a
```

or on PowerShell, set the vars individually before running the `server`
script.

## Run it

Two long-running processes, in separate terminals:

```bash
pnpm --filter @forge/surfaces run server   # Express + WS backend, port 4317
pnpm --filter @forge/surfaces run dev      # Vite cockpit UI
```

Open the URL Vite prints, go to `/surfaces`, submit an intent. Confirm the
backend is actually reachable first with `curl http://127.0.0.1:4317/healthz`.

## Things that reset per machine (by design, not a bug)

- **The context graph** (`.forge/learnings.json`) — gitignored. A fresh
  machine starts with zero banked learnings, same as a fresh clone. It
  rebuilds itself as real runs ship.
- **`forge-worktrees/`** — gitignored scratch space for in-flight agent
  worktrees. Safe to delete if stale ones pile up.
- **Codex CLI auth** (`~/.codex/auth.json`) and the OpenAI key — both
  machine-local credentials, neither travels with git.

## Known gotchas hit during real runs

- On Windows, forgetting `CODEX_BIN=codex.cmd` causes the pipeline to
  silently fall back to the fast simulated build even with
  `USE_REAL_CODEX=1` set — no error, it just looks like real agents aren't
  running. If a run finishes suspiciously fast (~1 minute) and the step
  actions look like scripted prose rather than tool-call output, this is
  almost always why.
- Real Codex CLI sessions can occasionally hit an auth/token-refresh error
  partway through a run. This is expected to happen sometimes, not a repo
  bug — the eval gate is supposed to catch it (that variant gets blocked,
  scored low, and the reason is banked as a context-graph learning) and the
  run still ships using whichever variant succeeded.
- The non-3D-game ("generic") decompose fallback path does not currently
  integrate cleanly — `packages/compose/src/integrate.ts` expects a
  renderer/shell/model contract shape that the generic graph doesn't
  produce, so those tasks reliably end up gate-blocked. Known, not yet
  fixed. Stick to game/3D-shaped intents for a working demo.
