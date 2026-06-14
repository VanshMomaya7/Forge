import { spawn } from 'node:child_process';
import readline from 'node:readline';
import type { Readable } from 'node:stream';

import type { AgentConfig, RunAgent } from '@forge/shared/contracts';
import type { Step, Task } from '@forge/shared/task';

// Runs a real Codex agent via `codex exec --json` inside the candidate worktree.
// Unlike the app-server turn (which tends to answer conversationally), exec runs
// autonomously and actually writes files to disk, which is what component build
// requires. Streams JSONL events as Steps.
export const runCodexExecAgent: RunAgent = async function* runCodexExecAgent(task, cfg) {
  const bin = resolveCodexBin();
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    '--color',
    'never',
    '--json'
  ];
  const reasoning = process.env.FORGE_CODEX_REASONING;
  if (reasoning) {
    args.push('-c', `model_reasoning_effort=${reasoning}`);
  }
  if (cfg.model) {
    args.push('-m', cfg.model);
  }
  args.push('-C', cfg.worktree);

  const child = spawn(bin, args, {
    cwd: cfg.worktree,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: isCommandShim(bin)
  });

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const exit = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
    child.once('error', () => resolve(null));
  });

  child.stdin?.write(formatPrompt(task, cfg));
  child.stdin?.end();

  let emitted = 0;
  if (child.stdout) {
    for await (const line of readLines(child.stdout)) {
      const summary = summarizeJsonLine(line);
      if (!summary) {
        continue;
      }
      emitted += 1;
      yield buildStep(task, cfg, emitted, summary.action, summary.output);
      if (cfg.maxSteps !== undefined && emitted >= cfg.maxSteps) {
        child.kill();
        break;
      }
    }
  }

  const code = await exit;
  if (code !== 0 && code !== null) {
    yield buildStep(task, cfg, emitted + 1, 'error', `codex exec exited ${code}: ${stderr.slice(-600)}`);
  }
};

async function* readLines(stream: Readable): AsyncGenerator<string> {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const queue: string[] = [];
  let notify: (() => void) | null = null;
  let ended = false;

  rl.on('line', (line) => {
    queue.push(line);
    notify?.();
    notify = null;
  });
  rl.on('close', () => {
    ended = true;
    notify?.();
    notify = null;
  });

  while (true) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    if (ended) {
      return;
    }
    await new Promise<void>((resolve) => {
      notify = resolve;
    });
  }
}

function summarizeJsonLine(line: string): { action: string; output: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return undefined;
  }

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

  return { action, output: output || JSON.stringify(value).slice(0, 200) };
}

function buildStep(task: Task, cfg: AgentConfig, sequence: number, action: string, output: string): Step {
  return {
    id: `${task.id}:exec-step-${sequence}`,
    agentId: deriveAgentId(cfg.worktree),
    action,
    output: output.slice(0, 600),
    ts: Date.now()
  };
}

function formatPrompt(task: Task, cfg: AgentConfig): string {
  return [task.intent, '', `Working directory (write files here): ${cfg.worktree}`].join('\n');
}

function deriveAgentId(worktree: string): string {
  const leaf = worktree.trim().split(/[\\/]+/).filter(Boolean).at(-1) ?? '';
  const safeLeaf = leaf
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return safeLeaf ? `codex-${safeLeaf}` : 'codex-agent';
}

function firstString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveCodexBin(): string {
  return process.env.CODEX_BIN ?? 'codex';
}

function isCommandShim(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}
