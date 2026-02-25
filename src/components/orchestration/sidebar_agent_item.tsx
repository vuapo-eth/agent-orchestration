"use client";

import { get_agent_color } from "@/utils/agent_color";
import type { AgentDoc } from "@/types/orchestrator";

export function SidebarAgentItem({
  doc,
  is_selected,
  on_select,
}: {
  doc: AgentDoc;
  is_selected: boolean;
  on_select: () => void;
}) {
  const color = get_agent_color(doc.name);

  return (
    <button
      type="button"
      onClick={on_select}
      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
        is_selected
          ? "border-zinc-600 bg-zinc-700/60 text-zinc-100 ring-1 ring-zinc-500/50"
          : "border-zinc-700/60 bg-zinc-800/40 text-zinc-200 hover:bg-zinc-700/40"
      }`}
    >
      <span className={`h-3 w-3 shrink-0 rounded-full ring-2 ring-white/10 ${color.dot}`} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{doc.name}</span>
    </button>
  );
}
