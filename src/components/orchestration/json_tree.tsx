"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function is_expandable(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function JsonPrimitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-zinc-500">null</span>;
  if (value === undefined) return <span className="text-zinc-500">—</span>;
  if (typeof value === "string")
    return <span className="text-amber-200/90">&quot;{value}&quot;</span>;
  if (typeof value === "number") return <span className="text-emerald-400">{value}</span>;
  if (typeof value === "boolean") return <span className="text-violet-400">{String(value)}</span>;
  return <span className="text-zinc-400">{String(value)}</span>;
}

function KeyWithTooltip({
  name,
  field_descriptions,
  children,
}: {
  name: string;
  field_descriptions?: Record<string, string> | null;
  children: React.ReactNode;
}) {
  const description = field_descriptions?.[name];
  if (description) {
    return (
      <span
        className="cursor-help border-b border-dotted border-zinc-500/60"
        title={description}
      >
        {children}
      </span>
    );
  }
  return <>{children}</>;
}

function JsonNode({
  name,
  value,
  depth = 0,
  field_descriptions,
}: {
  name: string | null;
  value: unknown;
  depth?: number;
  field_descriptions?: Record<string, string> | null;
}) {
  const [is_open, set_is_open] = useState(true);
  const expandable = is_expandable(value);

  if (!expandable) {
    return (
      <div
        className="flex items-baseline gap-2 truncate py-0.5 font-mono text-xs"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {name != null && (
          <>
            <KeyWithTooltip name={name} field_descriptions={field_descriptions}>
              <span className="shrink-0 text-zinc-500">{name}:</span>
            </KeyWithTooltip>{" "}
          </>
        )}
        <JsonPrimitive value={value} />
      </div>
    );
  }

  const is_array = Array.isArray(value);
  const entries = is_array
    ? (value as unknown[]).map((v, i) => ({ key: String(i), value: v }))
    : Object.entries(value as Record<string, unknown>).map(([key, val]) => ({ key, value: val }));

  return (
    <div className="font-mono text-xs">
      <button
        type="button"
        onClick={() => set_is_open((o) => !o)}
        className="flex items-center gap-1.5 py-0.5 hover:opacity-80"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {is_open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
        )}
        {name != null && (
          <KeyWithTooltip name={name} field_descriptions={field_descriptions}>
            <span className="text-cyan-300/90">{name}</span>
          </KeyWithTooltip>
        )}
        <span className="text-zinc-500">
          {is_array ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {is_open && (
        <div className="border-l border-zinc-700/60 ml-1.5">
          {entries.map(({ key, value: child }) => (
            <JsonNode
              key={key}
              name={is_array ? null : key}
              value={child}
              depth={depth + 1}
              field_descriptions={field_descriptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonTree({
  data,
  field_descriptions,
}: {
  data: unknown;
  field_descriptions?: Record<string, string> | null;
}) {
  if (!is_expandable(data)) {
    return (
      <div>
        <JsonPrimitive value={data} />
      </div>
    );
  }
  return (
    <div>
      <JsonNode name={null} value={data} depth={0} field_descriptions={field_descriptions} />
    </div>
  );
}
