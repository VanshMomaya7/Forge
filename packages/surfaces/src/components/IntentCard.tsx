import { MessageSquareText } from "lucide-react";
import type { Task } from "../shared/task";
import { getOriginLabel } from "../task/viewModel";

interface IntentCardProps {
  task: Task;
}

export function IntentCard({ task }: IntentCardProps) {
  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
      aria-labelledby="intent-title"
    >
      <div
        className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-normal text-zinc-500"
        id="intent-title"
      >
        <MessageSquareText size={16} aria-hidden="true" />
        <span>Intent</span>
        <span className={originClass(task.origin)}>{getOriginLabel(task.origin)}</span>
      </div>
      <p className="mt-3 text-xl font-semibold leading-snug text-zinc-950 [overflow-wrap:anywhere]">
        {task.intent}
      </p>
    </section>
  );
}

function originClass(origin: Task["origin"]): string {
  const base =
    "inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold lowercase";

  if (origin === "regression") return `${base} bg-orange-50 text-orange-700`;
  if (origin === "subtask") return `${base} bg-blue-50 text-blue-700`;
  return `${base} bg-emerald-50 text-emerald-700`;
}
