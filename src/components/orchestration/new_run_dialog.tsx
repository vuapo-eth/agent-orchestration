"use client";

import { useState, useCallback } from "react";
import { X } from "lucide-react";

export function NewRunDialog({
  is_open,
  on_close,
  on_submit,
}: {
  is_open: boolean;
  on_close: () => void;
  on_submit: (task: string) => void;
}) {
  const [task, set_task] = useState("");

  const handle_submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = task.trim();
      if (trimmed.length === 0) return;
      on_submit(trimmed);
      set_task("");
      on_close();
    },
    [task, on_submit, on_close]
  );

  const handle_backdrop_click = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) on_close();
    },
    [on_close]
  );

  if (!is_open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handle_backdrop_click}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">New run</h3>
          <button
            type="button"
            onClick={on_close}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handle_submit} className="p-4">
          <label className="mb-2 block text-xs font-medium text-zinc-400">Task</label>
          <textarea
            value={task}
            onChange={(e) => set_task(e.target.value)}
            placeholder="Describe what you want the orchestrator to do..."
            rows={4}
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={on_close}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={task.trim().length === 0}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate run
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
