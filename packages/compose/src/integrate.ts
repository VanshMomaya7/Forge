import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  ComponentCandidate,
  ComponentGraph,
  ComponentSpec
} from '@forge/shared/component';
import type { Task } from '@forge/shared/task';

const execFileAsync = promisify(execFile);

export type IntegrationResult = {
  artifactPath: string;
};

type StagedArtifact = {
  candidate: ComponentCandidate;
  spec: ComponentSpec;
  root: string;
  source: string;
  sourceIsFile: boolean;
};

export async function integrate(
  selected: ComponentCandidate[],
  graph: ComponentGraph,
  task: Task
): Promise<IntegrationResult> {
  const integrationRoot = path.resolve(
    String(task.context.integrationRoot ?? path.join('forge-worktrees', `${task.id}-integration`))
  );
  const artifactPath = path.join(integrationRoot, 'dist', 'site');
  const componentsRoot = path.join(integrationRoot, 'components');
  const worktree = await prepareIntegrationWorktree(task, integrationRoot);

  try {
    await mkdir(artifactPath, { recursive: true });
    await mkdir(componentsRoot, { recursive: true });

    const staged = await stageArtifacts(selected, graph, componentsRoot);
    const renderer = findByEntry(staged, 'mountRenderer');
    const shell = staged.find((artifact) => artifact.spec.contract.consumes?.length);
    const model = findModelProducer(staged, shell);

    if (!renderer) {
      throw new Error('No selected renderer exposes mountRenderer through its contract');
    }
    if (!shell) {
      throw new Error('No selected shell declares a consume contract');
    }
    if (!model) {
      throw new Error('No selected model produces an asset consumed by the shell');
    }

    const modelTarget = shell.spec.contract.consumes?.[0] ?? 'model.glb';
    const modelSource = path.join(model.root, model.spec.contract.produces?.[0] ?? modelTarget);
    const rendererSource = renderer.sourceIsFile
      ? path.join(renderer.root, path.basename(renderer.source))
      : renderer.source;

    await cp(modelSource, path.join(artifactPath, modelTarget), { force: true });
    await cp(rendererSource, path.join(artifactPath, 'renderer.mjs'), {
      force: true,
      recursive: true
    });
    await writeFile(
      path.join(artifactPath, 'index.html'),
      await buildShellHtml(shell, modelTarget),
      'utf8'
    );
    await writeFile(path.join(artifactPath, 'package.json'), buildPackageJson(), 'utf8');
    await mkdir(path.join(artifactPath, 'scripts'), { recursive: true });
    await writeFile(path.join(artifactPath, 'scripts', 'build-check.mjs'), buildCheckScript(), 'utf8');
    await writeManifest(artifactPath, {
      taskId: task.id,
      worktree,
      modelPath: modelTarget,
      rendererModule: 'renderer.mjs',
      rendererEntry: renderer.spec.contract.entry,
      shellEntry: shell.spec.contract.entry,
      selected: selected.map((candidate) => ({
        componentId: candidate.componentId,
        variantId: candidate.variantId,
        artifactPath: candidate.artifactPath
      })),
      contracts: graph.components.map((component) => ({
        componentId: component.id,
        contract: component.contract
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFailedArtifact(artifactPath, task, selected, graph, message);
  }

  task.selected = selected;
  task.integration = { artifactPath, passed: false };
  task.context.integrationWorktree = worktree;

  return { artifactPath };
}

async function prepareIntegrationWorktree(task: Task, integrationRoot: string): Promise<string> {
  const repoRoot = typeof task.context.repo === 'string' ? path.resolve(task.context.repo) : '';
  await mkdir(path.dirname(integrationRoot), { recursive: true });

  if (!repoRoot) {
    await mkdir(integrationRoot, { recursive: true });
    return integrationRoot;
  }

  try {
    await execGit(repoRoot, ['worktree', 'add', '--detach', integrationRoot, 'HEAD']);
    return integrationRoot;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = error instanceof Error ? error.message : String(error);
    task.context.integrationWorktreeFallback = code ? `${code}: ${message}` : message;
    await mkdir(integrationRoot, { recursive: true });
    return integrationRoot;
  }
}

async function execGit(repoRoot: string, args: string[]): Promise<void> {
  await execFileAsync('git', [
    '-c',
    `safe.directory=${repoRoot.replace(/\\/g, '/')}`,
    '-C',
    repoRoot,
    ...args
  ]);
}

async function stageArtifacts(
  selected: ComponentCandidate[],
  graph: ComponentGraph,
  componentsRoot: string
): Promise<StagedArtifact[]> {
  const staged: StagedArtifact[] = [];

  for (const candidate of selected) {
    const spec = graph.components.find((component) => component.id === candidate.componentId);
    if (!spec) {
      throw new Error(`No component spec found for ${candidate.componentId}`);
    }

    const source = await resolveArtifactSource(candidate);
    const sourceStat = await stat(source);
    const root = path.join(componentsRoot, candidate.componentId);
    await mkdir(root, { recursive: true });
    await cp(source, sourceStat.isFile() ? path.join(root, path.basename(source)) : root, {
      force: true,
      recursive: true
    });

    staged.push({ candidate, spec, root, source, sourceIsFile: sourceStat.isFile() });
  }

  return staged;
}

async function resolveArtifactSource(candidate: ComponentCandidate): Promise<string> {
  const declared = candidate.artifactPath ?? candidate.worktree;
  const candidates = [
    path.isAbsolute(declared) ? declared : path.resolve(candidate.worktree, declared),
    path.resolve(declared)
  ];

  for (const source of candidates) {
    try {
      await stat(source);
      return source;
    } catch {
      continue;
    }
  }

  throw new Error(`Artifact not found for ${candidate.variantId}: ${declared}`);
}

function findByEntry(staged: StagedArtifact[], entry: string): StagedArtifact | undefined {
  return staged.find((artifact) => artifact.spec.contract.entry?.includes(entry));
}

function findModelProducer(
  staged: StagedArtifact[],
  shell: StagedArtifact | undefined
): StagedArtifact | undefined {
  const consumed = shell?.spec.contract.consumes ?? [];

  return staged.find((artifact) =>
    artifact.spec.contract.produces?.some((produced) =>
      consumed.some((consume) => path.basename(produced) === path.basename(consume))
    )
  );
}

async function buildShellHtml(shell: StagedArtifact, modelTarget: string): Promise<string> {
  const entry = shell.spec.contract.entry ?? '';
  const templatePath = entry.includes('index.html') ? path.join(shell.root, 'index.html') : '';
  const script = `<script type="module">
import { mountRenderer } from './renderer.mjs';

const canvas = document.getElementById('scene');
mountRenderer(canvas, './${modelTarget.replace(/\\/g, '/')}');
</script>`;

  if (templatePath) {
    try {
      const template = await readFile(templatePath, 'utf8');
      if (template.includes('<!-- forge:renderer -->')) {
        return template.replace('<!-- forge:renderer -->', script);
      }

      return template.replace('</body>', `${script}\n</body>`);
    } catch {
      return defaultShell(script);
    }
  }

  return defaultShell(script);
}

function defaultShell(script: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Forge Compose Artifact</title>
  </head>
  <body>
    <canvas id="scene" width="640" height="360"></canvas>
    ${script}
  </body>
</html>
`;
}

function buildPackageJson(): string {
  return `${JSON.stringify(
    {
      type: 'module',
      scripts: {
        build: 'node scripts/build-check.mjs'
      }
    },
    null,
    2
  )}\n`;
}

function buildCheckScript(): string {
  return `import { access, readFile } from 'node:fs/promises';

await access(new URL('../index.html', import.meta.url));
await access(new URL('../renderer.mjs', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../integration-manifest.json', import.meta.url), 'utf8'));
if (manifest.integrationError) {
  throw new Error(manifest.integrationError);
}
await access(new URL('../' + manifest.modelPath, import.meta.url));
`;
}

async function writeFailedArtifact(
  artifactPath: string,
  task: Task,
  selected: ComponentCandidate[],
  graph: ComponentGraph,
  message: string
): Promise<void> {
  await mkdir(path.join(artifactPath, 'scripts'), { recursive: true });
  await writeFile(path.join(artifactPath, 'index.html'), defaultShell(''), 'utf8');
  await writeFile(
    path.join(artifactPath, 'renderer.mjs'),
    'export function mountRenderer() { throw new Error("integration failed before render"); }\n',
    'utf8'
  );
  await writeFile(path.join(artifactPath, 'package.json'), buildPackageJson(), 'utf8');
  await writeFile(path.join(artifactPath, 'scripts', 'build-check.mjs'), buildCheckScript(), 'utf8');
  await writeManifest(artifactPath, {
    taskId: task.id,
    modelPath: '__missing_contract_asset__',
    rendererModule: 'renderer.mjs',
    integrationError: message,
    selected: selected.map((candidate) => ({
      componentId: candidate.componentId,
      variantId: candidate.variantId,
      artifactPath: candidate.artifactPath
    })),
    contracts: graph.components.map((component) => ({
      componentId: component.id,
      contract: component.contract
    }))
  });
}

async function writeManifest(artifactPath: string, manifest: Record<string, unknown>): Promise<void> {
  await writeFile(
    path.join(artifactPath, 'integration-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
}
