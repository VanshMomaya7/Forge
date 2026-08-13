import { BrainCircuit, Sparkles } from "lucide-react";
import type { Task } from "../shared/task";
import { getReusedLearnings } from "../task/viewModel";

interface LearningsPanelProps {
  task: Task;
}

// The context graph, thin-sliced for the cockpit: this run either reused
// verified lessons a prior run earned, or it didn't. Both states are honest —
// the panel is meant to visibly "light up" only when reuse actually happened.
export function LearningsPanel({ task }: LearningsPanelProps) {
  const learnings = getReusedLearnings(task);
  const active = learnings.length > 0;

  return (
    <section
      className={`glass rounded-2xl p-4 transition ${active ? "ring-1 ring-violet-400/40" : ""}`}
      aria-labelledby="learnings-title"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div
          className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400"
          id="learnings-title"
        >
          <BrainCircuit size={15} aria-hidden="true" />
          <span>Context graph</span>
        </div>
        {active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-300">
            <Sparkles size={12} aria-hidden="true" />
            reused {learnings.length}
          </span>
        ) : (
          <span className="text-xs font-medium text-zinc-500">no reuse yet</span>
        )}
      </div>

      {active ? (
        <ul className="grid gap-2">
          {learnings.map((learning) => (
            <li
              key={learning.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs leading-5 text-zinc-300 [overflow-wrap:anywhere]"
            >
              <p>{learning.insight}</p>
              <p className="mt-1.5 font-mono text-[10px] text-zinc-500">
                verified · from {learning.sourceTaskId}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-5 text-zinc-500">
          This run starts from zero. Once it ships, whatever a losing variant got wrong is
          verified and banked — the next related run starts smarter.
        </p>
      )}
    </section>
  );
}
