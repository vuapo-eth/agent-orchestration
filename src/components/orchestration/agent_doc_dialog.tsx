"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import { AgentDetailView } from "./agent_detail_view";
import type { AgentDoc } from "@/types/orchestrator";

export function AgentDocDialog({
  is_open,
  on_close,
  doc,
}: {
  is_open: boolean;
  on_close: () => void;
  doc: AgentDoc | null;
}) {
  const handle_backdrop_click = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) on_close();
    },
    [on_close]
  );

  if (!is_open || doc == null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handle_backdrop_click}
    >
      <div
        className="flex flex-col w-full max-w-2xl max-h-[85vh] rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-700 px-4 py-3">
          <span className="text-sm font-semibold text-zinc-100">Agent documentation</span>
          <button
            type="button"
            onClick={on_close}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AgentDetailView doc={doc} />
        </div>
      </div>
    </div>
  );
}
