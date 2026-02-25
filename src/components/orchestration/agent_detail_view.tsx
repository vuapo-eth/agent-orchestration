"use client";

import { get_agent_color } from "@/utils/agent_color";
import type { AgentDoc } from "@/types/orchestrator";

export function AgentDetailView({ doc }: { doc: AgentDoc }) {
  const color = get_agent_color(doc.name);

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <span className={`h-4 w-4 shrink-0 rounded-full ring-2 ring-white/10 ${color.dot}`} />
        <h1 className="text-2xl font-semibold text-zinc-100">{doc.name}</h1>
      </div>
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Purpose</h2>
        <p className="text-zinc-300 leading-relaxed text-base">{doc.purpose}</p>
      </section>
      <section className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Arguments</h2>
        <ul className="space-y-4">
          {doc.args.map((arg) => (
            <li key={arg.name} className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 p-4">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono font-semibold text-cyan-300">{arg.name}</span>
                <span className="text-zinc-500 text-sm">({arg.format})</span>
              </div>
              <p className="text-zinc-400 mt-1.5 text-sm leading-relaxed">{arg.purpose}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Outputs</h2>
        <ul className="space-y-4">
          {Object.entries(doc.output_schema).map(([key, field]) => (
            <li key={key} className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 p-4">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono font-semibold text-emerald-300">{key}</span>
                <span className="text-zinc-500 text-sm">({field.type})</span>
              </div>
              <p className="text-zinc-400 mt-1.5 text-sm leading-relaxed">{field.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
