"use client";

import { useState, useCallback } from "react";
import { Pencil, Check, X } from "lucide-react";
import { JsonBlock } from "./json_block";
import { JsonTree } from "./json_tree";

function parse_json_safe(text: string): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Must be a JSON object" };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid JSON",
    };
  }
}

export function EditableJsonBlock({
  data,
  display_data,
  label,
  field_descriptions,
  on_save,
  read_only = false,
  tall = false,
}: {
  data: Record<string, unknown>;
  display_data?: Record<string, unknown> | null;
  label: string;
  field_descriptions?: Record<string, string> | null;
  on_save: (new_data: Record<string, unknown>) => void;
  read_only?: boolean;
  tall?: boolean;
}) {
  const view_data = display_data ?? data;
  const [is_editing, set_is_editing] = useState(false);
  const [edit_text, set_edit_text] = useState("");
  const [parse_error, set_parse_error] = useState<string | null>(null);

  const start_editing = useCallback(() => {
    set_edit_text(JSON.stringify(data, null, 2));
    set_parse_error(null);
    set_is_editing(true);
  }, [data]);

  const cancel_editing = useCallback(() => {
    set_is_editing(false);
    set_parse_error(null);
  }, []);

  const commit_save = useCallback(() => {
    const result = parse_json_safe(edit_text);
    if (!result.ok) {
      set_parse_error(result.error);
      return;
    }
    on_save(result.data);
    set_is_editing(false);
    set_parse_error(null);
  }, [edit_text, on_save]);

  if (read_only) {
    return (
      <JsonBlock data={view_data} label={label} field_descriptions={field_descriptions} tall={tall} />
    );
  }

  if (is_editing) {
    return (
      <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/80 overflow-hidden flex flex-col">
        <div className="shrink-0 px-3 py-1.5 text-xs font-medium bg-zinc-800/80 text-zinc-400 flex items-center justify-between gap-2">
          <span>{label}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={commit_save}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-emerald-400 hover:bg-emerald-500/20"
            >
              <Check className="h-3.5 w-3.5" />
              Save
            </button>
            <button
              type="button"
              onClick={cancel_editing}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-600/40"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
        <div className="border-t border-zinc-700/80 p-2 flex flex-col min-h-0 flex-1">
          <textarea
            value={edit_text}
            onChange={(e) => {
              set_edit_text(e.target.value);
              set_parse_error(null);
            }}
            className="flex-1 min-h-[120px] w-full rounded border border-zinc-600 bg-zinc-800/80 px-3 py-2 font-mono text-xs text-zinc-200 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            spellCheck={false}
          />
          {parse_error != null && (
            <p className="mt-1 text-xs text-red-400">{parse_error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/80 overflow-hidden flex flex-col relative group">
      <div className="shrink-0 px-3 py-1.5 text-xs font-medium bg-zinc-800/80 text-zinc-400 flex items-center justify-between">
        <span>{label}</span>
        <button
          type="button"
          onClick={start_editing}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-600/40 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          aria-label={`Edit ${label}`}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>
      <div className={`${tall ? "h-80" : "h-40"} min-h-0 overflow-y-auto border-t border-zinc-700/80 p-3`}>
        <JsonTree
          data={view_data}
          field_descriptions={field_descriptions}
          on_save={(new_data) => on_save(new_data as Record<string, unknown>)}
        />
      </div>
    </div>
  );
}
