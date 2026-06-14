import type { Task } from "../shared/task";
import { createTask } from "../task/createTask";

interface GithubCheckRunPayload {
  action?: string;
  check_run?: {
    id?: number;
    name?: string;
    conclusion?: string;
    html_url?: string;
    output?: {
      title?: string;
      summary?: string;
      text?: string;
    };
  };
  repository?: {
    full_name?: string;
    html_url?: string;
  };
}

export function taskFromGithubWebhook(
  payload: GithubCheckRunPayload,
  fallbackRepo = "unknown",
): Task | null {
  const conclusion = payload.check_run?.conclusion;
  if (payload.action !== "completed" || conclusion !== "failure") {
    return null;
  }

  const checkName = payload.check_run?.name ?? "GitHub check";
  const repo = payload.repository?.full_name ?? fallbackRepo;

  return createTask(
    "regression",
    `Fix failing check "${checkName}" in ${repo}`,
    {
      repo,
      failingTrace: {
        checkRunId: payload.check_run?.id,
        checkName,
        checkUrl: payload.check_run?.html_url,
        repositoryUrl: payload.repository?.html_url,
        title: payload.check_run?.output?.title,
        summary: payload.check_run?.output?.summary,
        text: payload.check_run?.output?.text,
      },
    },
  );
}
