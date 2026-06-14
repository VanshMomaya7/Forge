import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';

import type { AgentConfig, RunAgent } from '@forge/shared/contracts';
import type { Step, Task } from '@forge/shared/task';

type JsonObject = Record<string, unknown>;

type JsonRpcRequest = {
  method: string;
  id: number;
  params?: unknown;
};

type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  id: number;
  result?: unknown;
  error?: {
    code?: number;
    message: string;
  };
};

type AppServerMessage = JsonRpcResponse | JsonRpcNotification;

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

export type CodexAppServerTransport = {
  request(method: string, params?: unknown): Promise<unknown>;
  notify(method: string, params?: unknown): void;
  notifications(): AsyncIterable<JsonRpcNotification>;
  close(): void;
};

export type CodexAppServerRunnerOptions = {
  transport?: CodexAppServerTransport;
  codexBin?: string;
};

export const runRealCodexAgent: RunAgent = async function* runRealCodexAgent(task, cfg) {
  yield* runCodexAppServer(task, cfg);
};

export async function* runCodexAppServer(
  task: Task,
  cfg: AgentConfig,
  options: CodexAppServerRunnerOptions = {}
): AsyncGenerator<Step> {
  const transport = options.transport ?? spawnCodexAppServer(options.codexBin);
  let emitted = 0;

  try {
    await initialize(transport);
    const threadId = await startThread(transport, cfg);
    await startTurn(transport, threadId, task, cfg);

    for await (const notification of transport.notifications()) {
      const step = notificationToStep(notification, task, cfg, emitted + 1);
      if (step) {
        emitted += 1;
        yield step;
      }

      if (cfg.maxSteps !== undefined && emitted >= cfg.maxSteps) {
        return;
      }

      if (notification.method === 'turn/completed') {
        return;
      }
    }
  } finally {
    transport.close();
  }
}

export function notificationToStep(
  notification: JsonRpcNotification,
  task: Task,
  cfg: AgentConfig,
  sequence: number
): Step | undefined {
  switch (notification.method) {
    case 'item/started':
    case 'item/completed':
      return itemNotificationToStep(notification, task, cfg, sequence);
    case 'item/agentMessage/delta':
    case 'item/plan/delta':
    case 'item/commandExecution/outputDelta':
    case 'command/exec/outputDelta':
      return deltaNotificationToStep(notification, task, cfg, sequence);
    case 'item/fileChange/patchUpdated':
      return patchNotificationToStep(notification, task, cfg, sequence);
    case 'error':
      return buildStep(task, cfg, sequence, 'error', errorOutput(notification.params));
    default:
      return undefined;
  }
}

export function spawnCodexAppServer(codexBin = resolveCodexBin()): CodexAppServerTransport {
  const args = ['app-server'];
  const reasoning = process.env.FORGE_CODEX_REASONING;
  if (reasoning) {
    args.push('-c', `model_reasoning_effort=${reasoning}`);
  }
  args.push('--stdio');

  const child = spawn(codexBin, args, {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: isCommandShim(codexBin)
  });

  return new StdioAppServerTransport(child);
}

async function initialize(transport: CodexAppServerTransport): Promise<void> {
  await transport.request('initialize', {
    clientInfo: {
      name: 'forge_core',
      title: 'Forge Core',
      version: '0.0.0'
    },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false
    }
  });
  transport.notify('initialized', {});
}

async function startThread(
  transport: CodexAppServerTransport,
  cfg: AgentConfig
): Promise<string> {
  const params: JsonObject = {
    cwd: cfg.worktree,
    runtimeWorkspaceRoots: [cfg.worktree],
    approvalPolicy: 'never',
    sandbox: 'workspace-write',
    ephemeral: true
  };

  if (cfg.model) {
    params.model = cfg.model;
  }

  const result = asObject(await transport.request('thread/start', params));
  const thread = asObject(result.thread);
  const id = thread.id;

  if (typeof id !== 'string') {
    throw new Error('Codex app-server thread/start did not return a thread id');
  }

  return id;
}

async function startTurn(
  transport: CodexAppServerTransport,
  threadId: string,
  task: Task,
  cfg: AgentConfig
): Promise<void> {
  const params: JsonObject = {
    threadId,
    input: [
      {
        type: 'text',
        text: formatPrompt(task),
        text_elements: []
      }
    ],
    cwd: cfg.worktree,
    runtimeWorkspaceRoots: [cfg.worktree],
    approvalPolicy: 'never'
  };

  if (cfg.model) {
    params.model = cfg.model;
  }

  await transport.request('turn/start', params);
}

function itemNotificationToStep(
  notification: JsonRpcNotification,
  task: Task,
  cfg: AgentConfig,
  sequence: number
): Step | undefined {
  const params = asObject(notification.params);
  const item = asObject(params.item);
  const itemType = stringField(item, 'type');

  return buildStep(
    task,
    cfg,
    sequence,
    `${itemType}.${notification.method.endsWith('/started') ? 'started' : 'completed'}`,
    itemOutput(item)
  );
}

function deltaNotificationToStep(
  notification: JsonRpcNotification,
  task: Task,
  cfg: AgentConfig,
  sequence: number
): Step {
  return buildStep(
    task,
    cfg,
    sequence,
    notification.method,
    stringField(notification.params, 'delta')
  );
}

function patchNotificationToStep(
  notification: JsonRpcNotification,
  task: Task,
  cfg: AgentConfig,
  sequence: number
): Step {
  const params = asObject(notification.params);
  const changes = Array.isArray(params.changes) ? params.changes : [];

  return buildStep(
    task,
    cfg,
    sequence,
    notification.method,
    changes
      .map((change) => {
        const entry = asObject(change);
        return `${stringField(entry, 'kind')}: ${stringField(entry, 'path')}`;
      })
      .join('\n')
  );
}

function itemOutput(item: JsonObject): string {
  switch (item.type) {
    case 'agentMessage':
    case 'plan':
      return stringField(item, 'text');
    case 'reasoning':
      return [...stringArrayField(item, 'summary'), ...stringArrayField(item, 'content')].join('\n');
    case 'commandExecution':
      return [stringField(item, 'command'), stringField(item, 'aggregatedOutput')]
        .filter(Boolean)
        .join('\n');
    case 'fileChange':
      return jsonField(item, 'changes');
    case 'mcpToolCall':
    case 'dynamicToolCall':
    case 'collabAgentToolCall':
      return JSON.stringify(item);
    case 'webSearch':
      return stringField(item, 'query');
    case 'imageView':
      return stringField(item, 'path');
    case 'error':
      return stringField(item, 'message');
    default:
      return JSON.stringify(item);
  }
}

function buildStep(
  task: Task,
  cfg: AgentConfig,
  sequence: number,
  action: string,
  output: string
): Step {
  return {
    id: `${task.id}:codex-step-${sequence}`,
    agentId: deriveAgentId(cfg.worktree),
    action,
    output,
    ts: Date.now()
  };
}

function formatPrompt(task: Task): string {
  return [task.intent, '', 'Context:', JSON.stringify(task.context, null, 2)].join('\n');
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

function resolveCodexBin(): string {
  return process.env.CODEX_BIN ?? 'codex';
}

function isCommandShim(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function asObject(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null ? (value as JsonObject) : {};
}

function stringField(value: unknown, key: string): string {
  const field = asObject(value)[key];
  return typeof field === 'string' ? field : '';
}

function stringArrayField(value: JsonObject, key: string): string[] {
  const field = value[key];
  return Array.isArray(field) ? field.filter((item): item is string => typeof item === 'string') : [];
}

function jsonField(value: JsonObject, key: string): string {
  const field = value[key];
  return field === undefined ? '' : JSON.stringify(field);
}

function errorOutput(params: unknown): string {
  const error = asObject(asObject(params).error);
  return stringField(error, 'message') || stringField(params, 'message') || JSON.stringify(params);
}

class StdioAppServerTransport implements CodexAppServerTransport {
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly notificationQueue: JsonRpcNotification[] = [];
  private readonly notificationWaiters: Array<(value: IteratorResult<JsonRpcNotification>) => void> =
    [];
  private done = false;
  private stderr = '';

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      this.failAll(error);
    });
    child.once('exit', (code, signal) => {
      const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      const error =
        code === 0 && !signal
          ? undefined
          : new Error(`Codex app-server exited with ${detail}: ${this.stderr}`);
      this.finish(error);
    });

    readline
      .createInterface({ input: child.stdout, crlfDelay: Infinity })
      .on('line', (line) => {
        this.handleLine(line);
      });
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const message: JsonRpcRequest = { method, id };

    if (params !== undefined) {
      message.params = params;
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write(message);
    });
  }

  notify(method: string, params?: unknown): void {
    const message: JsonRpcNotification = { method };

    if (params !== undefined) {
      message.params = params;
    }

    this.write(message);
  }

  async *notifications(): AsyncIterable<JsonRpcNotification> {
    while (true) {
      const next = await this.nextNotification();
      if (next.done) {
        return;
      }

      yield next.value;
    }
  }

  close(): void {
    this.finish();
    if (!this.child.killed) {
      this.child.kill();
    }
  }

  private write(message: JsonRpcRequest | JsonRpcNotification): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    const message = JSON.parse(line) as AppServerMessage;

    if ('id' in message) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    this.pushNotification(message);
  }

  private pushNotification(notification: JsonRpcNotification): void {
    const waiter = this.notificationWaiters.shift();
    if (waiter) {
      waiter({ done: false, value: notification });
      return;
    }

    this.notificationQueue.push(notification);
  }

  private nextNotification(): Promise<IteratorResult<JsonRpcNotification>> {
    const notification = this.notificationQueue.shift();
    if (notification) {
      return Promise.resolve({ done: false, value: notification });
    }

    if (this.done) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise((resolve) => {
      this.notificationWaiters.push(resolve);
    });
  }

  private finish(error?: Error): void {
    if (this.done) {
      return;
    }

    this.done = true;
    if (error) {
      this.failAll(error);
    }

    for (const waiter of this.notificationWaiters) {
      waiter({ done: true, value: undefined });
    }
    this.notificationWaiters.length = 0;
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}
