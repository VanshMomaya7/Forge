import type { ComponentCandidate, ScoreResult, Step, Task } from "../shared/task";

// Drives a full game compose entirely in the browser, for the deployed build
// where there is no backend to stream over the websocket. Mirrors the core
// compose: each worktree streams its build steps in parallel, the two strongest
// variants are composed, and the staged result is the playable game.

const STEP_MIN_MS = 3300;
const STEP_SPREAD_MS = 2600;

const GAME_PLANS: string[][] = [
  [
    "reading the task + planning the scene graph",
    "scaffolding vite + react-ts",
    "writing Game.tsx",
    "modeling the rocket — nose, body, fins",
    "adding the thruster flame + lighting",
    "wiring keyboard + pointer controls",
    "spawning the asteroid field",
    "collision + score loop",
    "npm run build",
    "build passed",
  ],
  [
    "analyzing requirements",
    "init vite app with three",
    "drafting Game.tsx",
    "building rocket body + porthole",
    "starfield + camera rig",
    "pointer + key input",
    "asteroid spawner + recycling",
    "score HUD + game over",
    "vite build",
    "build passed",
  ],
  [
    "planning approach",
    "project scaffold",
    "Game.tsx skeleton",
    "rocket geometry + fins",
    "lighting + fog pass",
    "controls + clamp to bounds",
    "obstacles + difficulty ramp",
    "tuning feel",
    "build",
    "build passed",
  ],
];

const SHELL_PLAN = ["reading the layout contract", "writing page.tsx", "mounting <Game /> full-screen", "done"];

export function runClientSimulation(intent: string, onTask: (task: Task) => void): () => void {
  let cancelled = false;
  const now = Date.now();
  const id = `human-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const candidates: ComponentCandidate[] = [
    cand("game", "game:variant-1", id),
    cand("game", "game:variant-2", id),
    cand("game", "game:variant-3", id),
    cand("shell", "shell:0", id),
  ];

  const task: Task = {
    id,
    origin: "human",
    intent: intent.trim(),
    context: { repo: "forge", feed: [] },
    mode: "compose",
    steps: [],
    verdict: "running",
    createdAt: now,
    updatedAt: now,
    graph: { components: [], candidates },
  };

  const emit = () => {
    if (cancelled) return;
    task.updatedAt = Date.now();
    onTask(structuredClone(task));
  };
  const feed = (message: string) => {
    (task.context.feed as string[]).push(message);
  };
  const delay = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const gameVariants = candidates.filter((c) => c.componentId === "game");
  const shell = candidates.find((c) => c.componentId === "shell");

  const streamCandidate = async (candidate: ComponentCandidate, plan: string[], seed: number) => {
    await delay(seed % 420);
    for (let i = 0; i < plan.length; i++) {
      if (cancelled) return;
      await delay(STEP_MIN_MS + (((i + 1) * 137 + seed) % STEP_SPREAD_MS));
      if (cancelled) return;
      const step: Step = {
        id: `${id}:${candidate.variantId}:step-${i + 1}`,
        agentId: `codex-${candidate.variantId.replace(/[^a-z0-9-]+/gi, "-")}`,
        action: plan[i]!,
        output: "",
        ts: Date.now(),
      };
      candidate.steps.push(step);
      emit();
    }
  };

  void (async () => {
    emit();
    feed(`${gameVariants.length} worktrees spawned — Codex agents building in parallel`);
    await delay(900);
    emit();

    const jobs = gameVariants.map((c, i) => streamCandidate(c, GAME_PLANS[i % GAME_PLANS.length]!, i * 240 + 80));
    if (shell) jobs.push(streamCandidate(shell, SHELL_PLAN, 640));
    await Promise.all(jobs);
    if (cancelled) return;

    const overalls = [0.88, 0.92, 0.71];
    gameVariants.forEach((c, i) => {
      c.score = score(overalls[i] ?? 0.82);
    });
    if (shell) shell.score = score(0.9);
    feed("scoring candidates — selecting the strongest build");
    emit();

    await delay(4200);
    if (cancelled) return;

    const ranked = [...gameVariants].sort((a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0));
    const winners = ranked.slice(0, Math.min(2, ranked.length));
    task.selected = shell ? [...winners, shell] : [...winners];
    feed(`Mixture-of-Agents composing ${winners.map((w) => w.variantId).join(" + ")}`);
    emit();

    await delay(2600);
    if (cancelled) return;

    task.integration = {
      artifactPath: `forge-sites/${id}/source`,
      gate: score(0.92),
      passed: true,
    };
    emit();

    await delay(1600);
    if (cancelled) return;

    task.artifact = { deployUrl: "#play" };
    task.verdict = "shipped";
    feed("build ready — playable");
    emit();
  })();

  return () => {
    cancelled = true;
  };
}

function cand(componentId: string, variantId: string, id: string): ComponentCandidate {
  return {
    componentId,
    variantId,
    worktree: `forge-worktrees/${id}/components/${variantId.replace(":", "-")}`,
    steps: [],
  };
}

function score(overall: number): ScoreResult {
  return {
    rubricPass: overall >= 0.7,
    planAdherence: overall,
    toolCorrectness: overall,
    taskCompletion: overall,
    overall,
  };
}
