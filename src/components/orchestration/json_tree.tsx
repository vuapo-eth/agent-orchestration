"use client";

import { useState, useCallback, createContext, useContext, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function is_expandable(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function set_at_path(
  root: unknown,
  path: (string | number)[],
  value: unknown
): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const arr = [...root];
    const i = typeof head === "number" ? head : parseInt(String(head), 10);
    arr[i] = set_at_path(root[i], rest, value);
    return arr;
  }
  if (typeof root === "object" && root !== null) {
    return {
      ...(root as Record<string, unknown>),
      [String(head)]: set_at_path((root as Record<string, unknown>)[String(head)], rest, value),
    };
  }
  return root;
}

function format_for_edit(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  return String(value);
}

function parse_edit_value(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "—" || trimmed === "") return undefined;
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const num = Number(trimmed);
  if (trimmed !== "" && !Number.isNaN(num)) return num;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

const JsonEditContext = createContext<{
  root_data: unknown;
  on_save: (new_data: unknown) => void;
} | null>(null);

function JsonPrimitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-zinc-500">null</span>;
  if (value === undefined) return <span className="text-zinc-500">—</span>;
  if (typeof value === "string")
    return <span className="text-amber-200/90">&quot;{value}&quot;</span>;
  if (typeof value === "number") return <span className="text-emerald-400">{value}</span>;
  if (typeof value === "boolean") return <span className="text-violet-400">{String(value)}</span>;
  return <span className="text-zinc-400">{String(value)}</span>;
}

function EditableJsonPrimitive({
  value,
  path,
}: {
  value: unknown;
  path: (string | number)[];
}) {
  const ctx = useContext(JsonEditContext);
  const [is_editing, set_is_editing] = useState(false);
  const [edit_text, set_edit_text] = useState(() => format_for_edit(value));
  const input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (is_editing && input_ref.current) {
      input_ref.current.focus();
      input_ref.current.select();
    }
  }, [is_editing]);

  const commit = useCallback(() => {
    if (!ctx) return;
    const parsed = parse_edit_value(edit_text);
    const new_data = set_at_path(ctx.root_data, path, parsed);
    ctx.on_save(new_data);
    set_is_editing(false);
  }, [ctx, edit_text, path]);

  const cancel = useCallback(() => {
    set_edit_text(format_for_edit(value));
    set_is_editing(false);
  }, [value]);

  if (ctx == null) {
    return <JsonPrimitive value={value} />;
  }

  if (is_editing) {
    return (
      <input
        ref={input_ref}
        type="text"
        value={edit_text}
        onChange={(e) => set_edit_text(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        className="min-w-[80px] max-w-full rounded border border-cyan-500/60 bg-zinc-800 px-1 py-0.5 font-mono text-xs text-zinc-200 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        set_edit_text(format_for_edit(value));
        set_is_editing(true);
      }}
      className="rounded px-0.5 py-0.5 -my-0.5 text-left hover:bg-zinc-600/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:bg-zinc-600/50 cursor-pointer"
    >
      <JsonPrimitive value={value} />
    </button>
  );
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
  path,
  depth = 0,
  field_descriptions,
}: {
  name: string | null;
  value: unknown;
  path: (string | number)[];
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
        <EditableJsonPrimitive value={value} path={path} />
      </div>
    );
  }

  const is_array = Array.isArray(value);
  const entries = is_array
    ? (value as unknown[]).map((v, i) => ({ key: i, value: v }))
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
              key={String(key)}
              name={is_array ? null : String(key)}
              value={child}
              path={path.concat(key)}
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
  on_save,
}: {
  data: unknown;
  field_descriptions?: Record<string, string> | null;
  on_save?: (new_data: unknown) => void;
}) {
  const content = !is_expandable(data) ? (
    <div>
      <EditableJsonPrimitive value={data} path={[]} />
    </div>
  ) : (
    <div>
      <JsonNode
        name={null}
        value={data}
        path={[]}
        depth={0}
        field_descriptions={field_descriptions}
      />
    </div>
  );

  if (on_save != null) {
    return (
      <JsonEditContext.Provider value={{ root_data: data, on_save }}>
        {content}
      </JsonEditContext.Provider>
    );
  }

  return content;
}
