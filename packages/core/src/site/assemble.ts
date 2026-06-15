import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ComponentCandidate, ComponentGraph } from '@forge/shared/component';
import type { Task } from '@forge/shared/task';

import { ROCKET_GAME_TSX, isPlaceholderGame } from './rocket-game.js';

export type SiteAssembly = {
  artifactPath: string;
  sourceDir: string;
};

const DEFAULT_PAGE_TSX = `"use client";
import Game from "./Game";

export default function Page() {
  return <Game />;
}
`;

/**
 * Detects the three.js / vinext "game" graph produced by decompose. The static
 * renderer/model/shell compose path is left to @forge/compose untouched.
 */
export function isSiteGraph(graph: ComponentGraph): boolean {
  return graph.components.some((component) =>
    component.contract.produces?.some((produced) => produced.endsWith('Game.tsx'))
  );
}

/**
 * Stages the selected game + shell into a deployable site-source directory that
 * the Codex Sites deployer agent will scaffold into a vinext (Cloudflare Workers)
 * project and publish. Kept outside the forge repo so the deployer owns its git.
 */
export async function assembleSite(
  selected: ComponentCandidate[],
  graph: ComponentGraph,
  task: Task
): Promise<SiteAssembly> {
  const siteRoot = resolveSiteRoot(task);
  const sourceDir = path.join(siteRoot, 'source');
  await mkdir(sourceDir, { recursive: true });

  const game = selected.find((candidate) => candidate.componentId === 'game');
  if (!game) {
    throw new Error('assembleSite: no selected "game" candidate to integrate');
  }
  const shell = selected.find((candidate) => candidate.componentId === 'shell');

  // Ship the winning Game.tsx; if the agent produced nothing usable (empty or
  // the legacy blue-cube fallback), deploy the playable rocket game so the live
  // link is never an empty box.
  const producedGame = await readProduced(game, 'Game.tsx');
  const usedFallbackGame = isPlaceholderGame(producedGame);
  const gameSource = usedFallbackGame ? ROCKET_GAME_TSX : producedGame;
  const pageSource = shell ? (await readProduced(shell, 'page.tsx')) || DEFAULT_PAGE_TSX : DEFAULT_PAGE_TSX;

  await writeFile(path.join(sourceDir, 'Game.tsx'), gameSource, 'utf8');
  await writeFile(path.join(sourceDir, 'page.tsx'), pageSource, 'utf8');

  const manifest = {
    taskId: task.id,
    intent: task.intent,
    kind: 'vinext-three',
    selected: selected.map((candidate) => ({
      componentId: candidate.componentId,
      variantId: candidate.variantId,
      overall: candidate.score?.overall
    })),
    fallbackGame: usedFallbackGame,
    files: ['source/Game.tsx', 'source/page.tsx'],
    deps: { three: 'latest' }
  };
  await writeFile(
    path.join(siteRoot, 'FORGE_SITE.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  await writeFile(path.join(siteRoot, 'DEPLOY.md'), deployInstructions(task), 'utf8');

  task.context.siteSource = sourceDir;
  task.integration = { artifactPath: siteRoot, passed: false };

  return { artifactPath: siteRoot, sourceDir };
}

function deployInstructions(task: Task): string {
  return [
    '# Forge -> Codex Sites deploy',
    '',
    `Intent: ${task.intent}`,
    '',
    'This directory holds the Forge-selected three.js game source:',
    '- `source/Game.tsx` — a self-contained React client component (three.js).',
    '- `source/page.tsx` — renders `<Game />` full-screen.',
    '',
    'Deploy steps for the Sites agent:',
    '1. Scaffold the bundled vinext-starter here.',
    '2. Add `three` to dependencies.',
    '3. Copy `source/Game.tsx` -> `app/Game.tsx` and `source/page.tsx` -> `app/page.tsx`.',
    '4. `npm install && npm run build`, fixing any build errors.',
    '5. Create a Site, push source, save a version, and deploy via the Sites connector.',
    '6. Print `DEPLOY_URL=<public url>` on the final line.',
    ''
  ].join('\n');
}

async function readProduced(candidate: ComponentCandidate, filename: string): Promise<string> {
  const tried = new Set<string>();
  const attempts = [
    path.join(candidate.worktree, filename),
    candidate.artifactPath ? path.join(candidate.artifactPath, filename) : undefined,
    candidate.artifactPath
  ].filter((value): value is string => Boolean(value));

  for (const attempt of attempts) {
    if (tried.has(attempt)) continue;
    tried.add(attempt);
    try {
      const stats = await stat(attempt);
      if (stats.isFile()) {
        return await readFile(attempt, 'utf8');
      }
    } catch {
      continue;
    }
  }

  return '';
}

function resolveSiteRoot(task: Task): string {
  if (typeof task.context.siteRoot === 'string') {
    return path.resolve(task.context.siteRoot);
  }

  const repo = typeof task.context.repo === 'string' ? path.resolve(task.context.repo) : process.cwd();
  return path.resolve(repo, '..', 'forge-sites', sanitize(task.id));
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 96);
}
