"use client";

import { JsonTree } from "./json_tree";

export function JsonBlock({
  data,
  label,
  is_error = false,
  field_descriptions,
}: {
  data: Record<string, unknown> | string;
  label: string;
  is_error?: boolean;
  field_descriptions?: Record<string, string> | null;
}) {
  return (
    <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/80 overflow-hidden flex flex-col">
      <div
        className={`shrink-0 px-3 py-1.5 text-xs font-medium ${
          is_error ? "bg-red-950/50 text-red-400" : "bg-zinc-800/80 text-zinc-400"
        }`}
      >
        {label}
      </div>
      {typeof data === "string" ? (
        <pre className="h-40 shrink-0 overflow-auto border-t border-zinc-700/80 p-3 text-xs text-zinc-300 font-mono whitespace-pre-wrap break-words">
          {data}
        </pre>
      ) : (
        <div className="h-40 min-h-0 overflow-y-auto border-t border-zinc-700/80 p-3">
          <JsonTree data={data} field_descriptions={field_descriptions} />
        </div>
      )}
    </div>
  );
}
