"use client";

import { useMemo } from "react";
import { Loader2, X, CheckCircle, Circle, AlertCircle } from "lucide-react";
import type { Run } from "@/types/orchestration";
import { AGENT_DOCS_BY_NAME } from "@/lib/agents";

function get_action_label(agent_name: string) {
  return AGENT_DOCS_BY_NAME[agent_name]?.action_label ?? agent_name;
}

function format_label_for_display(agent_name: string, with_ellipsis: boolean) {
  const label = get_action_label(agent_name).toLowerCase();
  return with_ellipsis ? `${label}...` : label;
}

export function RunProgressDialog({
  is_open,
  on_close,
  run,
}: {
  is_open: boolean;
  on_close: () => void;
  run: Run;
  is_running_all?: boolean;
}) {
  const { progress_pct } = useMemo(() => {
    const done = run.agent_calls.filter((c) => c.state === "finished" || c.state === "error");
    const total = run.agent_calls.length;
    const progress_pct = total > 0 ? (done.length / total) * 100 : 0;
    return { progress_pct };
  }, [run.agent_calls]);

  if (!is_open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        aria-hidden
        onClick={on_close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Run progress"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-600 bg-zinc-900 shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-end border-b border-zinc-700 p-2">
          <button
            type="button"
            onClick={on_close}
            className="rounded p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div
            className="h-2 rounded-full overflow-hidden bg-zinc-800"
            role="progressbar"
            aria-valuenow={Math.round(progress_pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 ease-out"
              style={{ width: `${progress_pct}%` }}
            />
          </div>

          <ul className="space-y-1">
            {run.agent_calls.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-2 text-sm text-zinc-300"
              >
                {c.state === "finished" ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : c.state === "error" ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                ) : c.state === "running" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-400" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-zinc-500" />
                )}
                <span className="truncate">{format_label_for_display(c.agent_name, true)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
