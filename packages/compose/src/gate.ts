import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import type { ScoreResult, Task } from '@forge/shared/task';

const execFileAsync = promisify(execFile);

export type IntegrationGateResult = {
  gate: ScoreResult;
  passed: boolean;
  repairTask?: Task;
};

type IntegrationManifest = {
  modelPath: string;
  rendererModule: string;
  rendererEntry?: string;
  contracts?: unknown;
};

export async function integrationGate(
  artifactPath: string,
  task: Task
): Promise<IntegrationGateResult> {
  const trace: string[] = [];

  try {
    const resolvedArtifactPath = path.resolve(artifactPath);
    await runBuild(resolvedArtifactPath, trace);
    const manifest = await readManifest(resolvedArtifactPath, trace);
    await checkPageShell(resolvedArtifactPath, manifest, trace);
    await runHeadlessContractCheck(resolvedArtifactPath, manifest, trace);

    return finish(task, resolvedArtifactPath, buildGate(true, task.intent, trace));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trace.push(`failed: ${message}`);
    return finish(task, path.resolve(artifactPath), buildGate(false, task.intent, trace), trace);
  }
}

async function runBuild(artifactPath: string, trace: string[]): Promise<void> {
  try {
    await access(path.join(artifactPath, 'package.json'));
  } catch {
    throw new Error('assembled artifact is missing package.json');
  }

  try {
    await execFileAsync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: artifactPath,
      timeout: 30_000
    });
    trace.push('build: npm run build passed');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'EINVAL') {
      throw error;
    }

    await execFileAsync(process.execPath, ['scripts/build-check.mjs'], {
      cwd: artifactPath,
      timeout: 30_000
    });
    trace.push(`build: npm unavailable (${code}); node build-check passed`);
  }
}

async function readManifest(
  artifactPath: string,
  trace: string[]
): Promise<IntegrationManifest> {
  const manifest = JSON.parse(
    await readFile(path.join(artifactPath, 'integration-manifest.json'), 'utf8')
  ) as IntegrationManifest;

  if (!manifest.modelPath || !manifest.rendererModule) {
    throw new Error('integration manifest is missing modelPath or rendererModule');
  }

  trace.push(`manifest: renderer=${manifest.rendererModule} model=${manifest.modelPath}`);
  return manifest;
}

async function runHeadlessContractCheck(
  artifactPath: string,
  manifest: IntegrationManifest,
  trace: string[]
): Promise<void> {
  await access(path.join(artifactPath, manifest.modelPath));
  const rendererPath = path.join(artifactPath, manifest.rendererModule);
  await access(rendererPath);

  const moduleUrl = `${pathToFileURL(rendererPath).href}?t=${Date.now()}`;
  const renderer = (await import(moduleUrl)) as { mountRenderer?: unknown };

  if (typeof renderer.mountRenderer !== 'function') {
    throw new Error('renderer contract entry mountRenderer is not exported');
  }

  const drawOps: string[] = [];
  const consoleErrors: string[] = [];
  const context = createCanvasContext(drawOps);
  const previousConsoleError = console.error;
  const canvas = {
    width: 640,
    height: 360,
    getContext(type: string) {
      return type === '2d' ? context : null;
    }
  };

  const started = performance.now();
  try {
    console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    };
    await Promise.race([
      Promise.resolve(renderer.mountRenderer(canvas, `./${manifest.modelPath}`)),
      timeout(2_000)
    ]);
  } finally {
    console.error = previousConsoleError;
  }

  if (drawOps.length === 0) {
    throw new Error('renderer mounted but did not render to the canvas');
  }
  if (consoleErrors.length > 0) {
    throw new Error(`renderer wrote console errors: ${consoleErrors.join('; ')}`);
  }

  const elapsedMs = Math.round(performance.now() - started);
  trace.push(`headless: canvas rendered with ${drawOps.length} draw operation(s) in ${elapsedMs}ms`);
}

async function checkPageShell(
  artifactPath: string,
  manifest: IntegrationManifest,
  trace: string[]
): Promise<void> {
  const html = await readFile(path.join(artifactPath, 'index.html'), 'utf8');

  if (!/<canvas\b[^>]*\bid=["']scene["']/i.test(html)) {
    throw new Error('page shell is missing <canvas id="scene">');
  }
  if (!html.includes(manifest.rendererModule)) {
    throw new Error('page shell does not load the renderer module');
  }
  if (!html.includes(manifest.modelPath)) {
    throw new Error('page shell does not reference the consumed model path');
  }

  trace.push('page: shell references canvas, renderer, and model contract path');
}

function createCanvasContext(drawOps: string[]): Record<string, unknown> {
  const methods = [
    'arc',
    'beginPath',
    'clearRect',
    'closePath',
    'drawImage',
    'fill',
    'fillRect',
    'fillText',
    'lineTo',
    'moveTo',
    'stroke'
  ];
  const context: Record<string, unknown> = {};

  for (const method of methods) {
    context[method] = () => {
      drawOps.push(method);
    };
  }

  return context;
}

function buildGate(passed: boolean, intent: string, trace: string[]): ScoreResult {
  return {
    rubricPass: passed,
    planAdherence: passed ? 0.94 : 0.35,
    toolCorrectness: passed ? 0.93 : 0.25,
    taskCompletion: passed ? 0.95 : 0.2,
    overall: passed ? 0.94 : 0.25,
    notes: [`intent: ${intent}`, ...trace].join('\n')
  };
}

function finish(
  task: Task,
  artifactPath: string,
  gate: ScoreResult,
  trace?: string[]
): IntegrationGateResult {
  const passed = gate.rubricPass && gate.overall >= 0.8;
  task.integration = { artifactPath, gate, passed };
  let repairTask: Task | undefined;

  if (!passed) {
    repairTask = createRepairTask(task, artifactPath, trace ?? gate.notes?.split('\n') ?? []);
    task.context.repairTask = repairTask;
    task.context.repairDispatch = {
      kind: 'compose.integration.repair',
      taskId: repairTask.id,
      parentId: task.id,
      artifactPath
    };
  }

  return repairTask ? { gate, passed, repairTask } : { gate, passed };
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`renderer timed out after ${ms}ms`)), ms);
  });
}

function createRepairTask(task: Task, artifactPath: string, trace: string[]): Task {
  const now = Date.now();

  return {
    id: `${task.id}:repair:${now}`,
    parentId: task.id,
    origin: 'subtask',
    mode: 'compose',
    intent: `Repair composed artifact for: ${task.intent}`,
    context: {
      artifactPath,
      failingTrace: trace,
      selected: task.selected,
      originalIntent: task.intent
    },
    steps: [],
    verdict: 'running',
    createdAt: now,
    updatedAt: now
  };
}
