import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

import type { ComponentCandidate } from '@forge/shared/component';
import type { Step, Task } from '@forge/shared/task';

import { emitTaskUpdated } from '../event-bus.js';
import { upsert } from '../store.js';

export type SiteDeployResult = {
  deployUrl?: string;
  blocker?: string;
  raw: string;
};

const DEPLOY_AGENT_ID = 'codex-deploy';
const EMIT_THROTTLE_MS = 350;

/**
 * Publishes the assembled site to Codex Sites by running a `codex exec` agent
 * that has the `sites` plugin + Sites connector. Streams the agent's work into
 * the task as a live "deploy" row and captures the public URL (or a precise
 * blocker, e.g. the connector needing interactive authorization).
 */
export async function deploySite(artifactPath: string, task: Task): Promise<SiteDeployResult> {
  const lastMessageFile = path.join(artifactPath, '.forge-deploy-last.txt');
  const candidate = ensureDeployCandidate(task, artifactPath);
  let sequence = 0;
  let lastEmit = 0;

  const emit = (force = false): void => {
    const now = Date.now();
    if (!force && now - lastEmit < EMIT_THROTTLE_MS) return;
    lastEmit = now;
    task.updatedAt = now;
    upsert(task);
    emitTaskUpdated(task);
  };
  const pushStep = (action: string, output: string): void => {
    sequence += 1;
    candidate.steps.push({
      id: `${task.id}:deploy-${sequence}`,
      agentId: DEPLOY_AGENT_ID,
      action,
      output: output.slice(0, 600),
      ts: Date.now()
    });
    emit();
  };

  pushStep('deploy/start', 'Launching Codex Sites deployer (sites plugin + connector).');

  const bin = resolveCodexBin();
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    '-c',
    'sandbox_workspace_write.network_access=true',
    '-c',
    `model_reasoning_effort=${process.env.FORGE_DEPLOY_REASONING ?? 'medium'}`,
    '--color',
    'never',
    '--json',
    '--output-last-message',
    lastMessageFile,
    '-C',
    artifactPath
  ];

  const env = { ...process.env };
  if (!env.CODEX_SQLITE_HOME && typeof task.context.repo === 'string') {
    env.CODEX_SQLITE_HOME = path.join(path.resolve(task.context.repo), '.codex-runtime', 'sqlite');
  }

  const timeoutMs = Number(process.env.FORGE_DEPLOY_TIMEOUT_MS ?? 1_200_000);
  let stdout = '';
  let stderr = '';

  const exitInfo = await new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
    const child = spawn(bin, args, {
      cwd: artifactPath,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isCommandShim(bin)
    });

    const timer = setTimeout(() => {
      pushStep('deploy/timeout', `Deploy exceeded ${timeoutMs}ms; terminating agent.`);
      child.kill();
      resolve({ code: null, timedOut: true });
    }, timeoutMs);

    child.once('error', (error) => {
      clearTimeout(timer);
      stderr += `\nspawn error: ${error.message}`;
      resolve({ code: null, timedOut: false });
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut: false });
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    if (child.stdout) {
      readline
        .createInterface({ input: child.stdout, crlfDelay: Infinity })
        .on('line', (line) => {
          stdout += `${line}\n`;
          const summary = summarizeJsonLine(line);
          if (summary) {
            pushStep(summary.action, summary.output);
          }
        });
    }

    child.stdin?.write(deployPrompt(task));
    child.stdin?.end();
  });

  const lastMessage = await readFileSafe(lastMessageFile);
  const raw = `${lastMessage}\n${stdout}\n${stderr}`.trim();
  const parsed = parseOutcome(lastMessage, stdout, exitInfo.timedOut);

  if (parsed.deployUrl) {
    pushStep('deploy/live', `Deployed: ${parsed.deployUrl}`);
  } else {
    pushStep('deploy/blocked', parsed.blocker ?? 'No deploy URL produced.');
  }
  emit(true);

  return { ...parsed, raw };
}

function ensureDeployCandidate(task: Task, artifactPath: string): ComponentCandidate {
  if (!task.graph) {
    task.graph = { components: [], candidates: [] };
  }

  const existing = task.graph.candidates.find((item) => item.componentId === 'deploy');
  if (existing) {
    return existing;
  }

  const candidate: ComponentCandidate = {
    componentId: 'deploy',
    variantId: 'deploy:site',
    worktree: artifactPath,
    steps: [] as Step[]
  };
  task.graph.candidates.push(candidate);
  return candidate;
}

function deployPrompt(task: Task): string {
  return [
    "You are Forge's deployment agent. The current directory contains source/Game.tsx and",
    'source/page.tsx — a self-contained three.js game (a React client component) selected by',
    "Forge's agent mixture. See DEPLOY.md.",
    '',
    `Original request: ${task.intent}`,
    '',
    'Goal: publish this as a LIVE website on Codex Sites and return its public URL.',
    '',
    'Use the Sites skills (sites-building, sites-hosting) and the Sites connector:',
    '1. Scaffold the bundled vinext-starter here (preserve its layout).',
    '2. Add "three" as a dependency.',
    '3. Put source/Game.tsx at app/Game.tsx and source/page.tsx at app/page.tsx so the home',
    '   page renders <Game/> full-screen as a client component.',
    '4. Run npm install and the vinext build; fix any build errors until it builds clean.',
    '5. Create a new Site, push the source, save a version, and deploy to production via the',
    '   Sites connector.',
    '',
    'To keep this fast: SKIP the optional public/screenshot.jpeg preview and do NOT install',
    'Playwright or Chromium or launch a preview browser. A missing screenshot is acceptable.',
    '',
    'IMPORTANT OUTPUT CONTRACT: on the FINAL line of your last message, print exactly one of:',
    '  DEPLOY_URL=<the public https url>',
    '  DEPLOY_BLOCKED=<one line: the concrete blocker and the exact action required>',
    'Do not omit this line.'
  ].join('\n');
}

function summarizeJsonLine(line: string): { action: string; output: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return undefined;

  let value: Record<string, unknown>;
  try {
    value = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  const msg = isRecord(value.msg) ? value.msg : value;
  const item = isRecord(msg.item) ? msg.item : isRecord(value.item) ? value.item : undefined;
  const action = String(
    (typeof msg.type === 'string' && msg.type) ||
      (item && typeof item.type === 'string' && item.type) ||
      (typeof value.type === 'string' && value.type) ||
      'event'
  );

  const output =
    firstString([
      msg.message,
      msg.text,
      msg.delta,
      item?.text,
      item?.command,
      item?.aggregated_output,
      item?.message
    ]) ?? '';

  if (!output && action === 'event') {
    return undefined;
  }

  return { action, output: output || compact(value) };
}

function parseOutcome(
  lastMessage: string,
  stdout: string,
  timedOut: boolean
): { deployUrl?: string; blocker?: string } {
  const haystack = `${lastMessage}\n${stdout}`;

  const urlTag = haystack.match(/DEPLOY_URL=\s*(\S+)/i);
  if (urlTag) {
    return { deployUrl: cleanUrl(urlTag[1]!) };
  }

  const blockedTag = haystack.match(/DEPLOY_BLOCKED=\s*(.+)/i);
  if (blockedTag) {
    return { blocker: blockedTag[1]!.trim() };
  }

  const urls = [...haystack.matchAll(/https?:\/\/[^\s)'"`]+/g)].map((match) => match[0]);
  const preferred =
    urls.reverse().find((url) => /(sites|workers|openai|pages\.dev)/i.test(url)) ?? urls[0];
  if (preferred) {
    return { deployUrl: cleanUrl(preferred) };
  }

  if (timedOut) {
    return { blocker: 'Deploy timed out before a URL was produced.' };
  }

  return {
    blocker:
      'Deployer finished without a DEPLOY_URL. Likely the Sites connector needs interactive ' +
      'authorization — run `codex` once and deploy any site to grant it, then retry.'
  };
}

function cleanUrl(url: string): string {
  return url.replace(/[.,)\]]+$/, '');
}

function firstString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function compact(value: unknown): string {
  return JSON.stringify(value).slice(0, 200);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readFileSafe(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

function resolveCodexBin(): string {
  return process.env.CODEX_BIN ?? 'codex';
}

function isCommandShim(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}
