import type { Task } from "../shared/task";

export interface SitesDeployRequest {
  task: Task;
  worktree?: string;
  buildCommand?: string;
  outputDir?: string;
}

export interface SitesDeployResult {
  url: string;
}

export type SitesDeployer = (
  request: SitesDeployRequest,
) => Promise<SitesDeployResult>;

export async function shipWinnerViaSites(
  task: Task,
  deployer?: SitesDeployer,
): Promise<Task> {
  const fallbackUrl = readEnv("FORGE_DEMO_DEPLOY_URL");
  const result = deployer
    ? await deployer({
        task,
        worktree: typeof task.context.worktree === "string" ? task.context.worktree : undefined,
        buildCommand: "npm run build",
        outputDir: "dist",
      })
    : { url: fallbackUrl ?? task.artifact?.deployUrl ?? "" };

  if (!result.url) {
    throw new Error(
      "No deploy URL available. Provide a Sites deployer or FORGE_DEMO_DEPLOY_URL.",
    );
  }

  return {
    ...task,
    verdict: "shipped",
    artifact: { ...task.artifact, deployUrl: result.url },
    updatedAt: Date.now(),
  };
}

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env[name];
}
