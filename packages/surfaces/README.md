# Forge Surfaces

Person 3 package: the cockpit plus the thin adapters that create or ship Tasks.

## What is included

- React cockpit that subscribes to `{ type: "task.updated", task }`.
- Mock task emitter that scripts intent -> three agents -> scores -> blocked agent -> promoted winner -> deploy -> regression task.
- Intake adapter: `createTask("human", text, { repo })`, then optional `forkAndRun`.
- GitHub CI webhook adapter for failed `check_run` events.
- Swarm trigger adapter that loads `@forge/core` at runtime when P1 is ready.
- Sites deploy adapter interface that writes the deploy URL onto `task.artifact.deployUrl`.
- Telemetry watcher that dispatches a regression Task on latency or error-rate breach.
- Tiny Express server with `/webhook/github`, `/api/intake`, `/api/tasks/:id/swarm`, `/api/watch`, and `/ws`.

## Local run

```bash
npm install
npm run dev
```

Optional server bus:

```bash
npm run server
```

Set `VITE_FORGE_WS_URL=ws://127.0.0.1:4317/ws` when you want the cockpit to use the server bus. Without that URL, it runs fully from the mock emitter.

## Handoff points

- Replace `src/shared/task.ts` with the frozen repo-level `shared/task.ts` once it lands.
- Point `VITE_FORGE_WS_URL` at P1's websocket bus.
- Let `src/adapters/swarm.ts` resolve real `@forge/core.forkAndRun`.
- Pass a real Sites deployer to `shipWinnerViaSites` from `src/adapters/sites.ts`.
- Start `startTelemetryWatcher` after a winner has `artifact.deployUrl`.
