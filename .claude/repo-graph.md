# Forge — Repo Graph

Quick map of the repo for agents. See `README.md` for the full story and `CLAUDE.md` for setup.

## File structure (tracked files)

```
forge/
├── CLAUDE.md                     # setup & operating notes
├── README.md
├── package.json                  # pnpm workspace root (build/lint/test/demo scripts)
├── pnpm-workspace.yaml
├── tsconfig.json / tsconfig.eslint.json / eslint.config.mjs / vitest.config.ts
├── shared/                       # @forge/shared — frozen contracts
│   ├── task.ts                   #   Task, Step, ScoreResult, verdicts
│   ├── component.ts              #   ComponentGraph, ComponentSpec, ComponentCandidate
│   ├── contracts.ts              #   RunAgent / ForkAndRun / Promote signatures
│   └── learning.ts               #   context-graph learning shape
└── packages/
    ├── core/                     # @forge/core — the engine
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── router.ts         #   runTask → race | compose
    │   │   ├── decompose.ts      #   intent → ComponentGraph
    │   │   ├── build-components.ts  # one Codex agent per candidate, own worktree
    │   │   ├── run-agent.ts
    │   │   ├── codex-exec.ts     #   `codex exec --json` runner
    │   │   ├── codex-app-server.ts  # JSON-RPC runner (alt)
    │   │   ├── orchestrator.ts   #   race mode: forkAndRun + promote
    │   │   ├── learnings.ts      #   context graph (.forge/learnings.json)
    │   │   ├── event-bus.ts      #   task.updated pub/sub
    │   │   ├── store.ts          #   in-memory task store
    │   │   ├── dev.ts / real-run.ts / deploy-run.ts   # CLI entry points
    │   │   └── site/
    │   │       ├── index.ts
    │   │       ├── assemble.ts   #   winners → deployable site
    │   │       ├── gate.ts       #   esbuild compile + contract gate
    │   │       ├── deploy.ts     #   Codex Sites deployer
    │   │       ├── preview.ts    #   playable preview
    │   │       ├── simulate.ts   #   stub build path
    │   │       └── rocket-game.ts
    │   └── test/                 #   codex-app-server, compose, event-bus, orchestrator,
    │                             #   run-agent, site, store
    ├── compose/                  # @forge/compose — select / integrate / gate
    │   ├── src/ fixture.ts gate.ts index.ts integrate.ts replay.ts schemas.ts select.ts
    │   ├── fixtures/artifacts/   #   model-blender, model-online, renderer, shell
    │   └── test/                 #   integration, select
    ├── evals/                    # @forge/evals — rubric, scoring, pass/block/redirect gate
    │   ├── src/ aggregate.ts checks.ts constants.ts contracts.ts fixtures.ts gate.ts
    │   │        index.ts math.ts model-judge.ts replay.ts rubric.ts schemas.ts score.ts
    │   └── test/evals.test.ts
    └── surfaces/                 # @forge/surfaces — cockpit (backend + UI)
        ├── index.html, vite.config.ts, tailwind/postcss configs, vercel.json, .env.example
        ├── src/
        │   ├── main.tsx, App.tsx, RocketGame.tsx, styles.css
        │   ├── server/ index.ts eventBus.ts     # Express + WS (:4317), /api/intake, /ws, /preview/:id
        │   ├── adapters/ intake ciWebhook sites swarm telemetry
        │   ├── components/ AgentDrilldown IntentCard LearningsPanel ShipHealStrip
        │   │               SwarmSection WorktreeForest
        │   ├── stream/ connectTaskUpdates.ts clientSimulation.ts
        │   ├── task/ createTask.ts viewModel.ts
        │   └── shared/task.ts
        └── test/intake.test.ts
```

Gitignored, per-machine: `.env`, `.forge/learnings.json`, `forge-worktrees/`, `dist/`.

## Architecture

Package dependencies (from actual imports): `surfaces → core → {compose, evals} → shared`.

```mermaid
flowchart TD
    subgraph UI["packages/surfaces (cockpit)"]
        VITE["React 19 + Vite UI<br/>App, SwarmSection, WorktreeForest,<br/>AgentDrilldown, LearningsPanel"]
        SRV["server/index.ts<br/>Express + WebSocket :4317"]
    end

    subgraph CORE["packages/core (engine)"]
        ROUTER["router.ts · runTask"]
        DEC["decompose.ts"]
        BUILD["build-components.ts"]
        RUNNER["codex-exec.ts / codex-app-server.ts<br/>(or simulate.ts stub)"]
        ORCH["orchestrator.ts<br/>race: forkAndRun + promote"]
        SITE["site/ assemble → gate → deploy<br/>+ preview"]
        LEARN["learnings.ts<br/>context graph"]
        BUS["event-bus.ts + store.ts"]
    end

    COMPOSE["packages/compose<br/>selectBest · integrate · integrationGate"]
    EVALS["packages/evals<br/>rubric · score · gate · model-judge"]
    SHARED["shared/<br/>Task · ComponentGraph · contracts · learning"]

    WT[("git worktrees<br/>forge-worktrees/")]
    CODEX[["Codex CLI"]]
    SITES[["Codex Sites<br/>live URL"]]
    LJSON[(".forge/learnings.json")]

    VITE -- "POST /api/intake" --> SRV
    SRV -- "task.updated over /ws" --> VITE
    SRV --> ROUTER

    ROUTER -- compose --> DEC --> BUILD
    ROUTER -- race --> ORCH
    BUILD --> RUNNER --> CODEX
    RUNNER --> WT
    BUILD -- score candidates --> EVALS
    ORCH --> EVALS
    BUILD --> COMPOSE
    COMPOSE -- winners --> SITE
    SITE --> SITES
    ROUTER --> LEARN --> LJSON
    ROUTER --> BUS --> SRV

    CORE -.-> SHARED
    COMPOSE -.-> SHARED
    EVALS -.-> SHARED
```

### Compose pipeline (the main path)

```
runTask → decompose → buildComponents (N Codex agents, N worktrees)
        → selectBest → assembleSite → siteGate → deploySite
        (every step emits task.updated → /ws → cockpit)
```
