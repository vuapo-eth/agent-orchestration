"use client";

import { memo, useState } from "react";
import { createPortal } from "react-dom";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import { X } from "lucide-react";
import { JsonTree } from "./json_tree";

const MAX_LENGTH = 24;
const BOX_WIDTH = 88;
const BOX_HEIGHT = 28;

function stringify_value(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function eclipse_text(text: string, max_len: number = MAX_LENGTH): string {
  if (text.length <= max_len) return text;
  return text.slice(0, max_len - 3) + "...";
}

function DagConstantNodeInner({
  data,
  on_click,
}: {
  data: { value: unknown };
  on_click: () => void;
}) {
  const raw = stringify_value(data.value);
  const display = eclipse_text(raw);
  const is_truncated = raw.length > MAX_LENGTH;
  return (
    <div
      className="rounded-md border border-zinc-600 bg-zinc-800/90 shadow flex items-center justify-center px-2 py-1.5 min-w-0 cursor-pointer relative"
      style={{ width: BOX_WIDTH, height: BOX_HEIGHT }}
      onClick={on_click}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          on_click();
        }
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-1/2 -translate-y-1/2">
        <Handle
        type="source"
        position={Position.Right}
        id="value"
        className="!h-2 !w-2 !border-2 !border-zinc-600 !bg-zinc-700"
        style={{ right: 0, top: "50%", transform: "translateY(-50%)" }}
      />
      </div>
      <span
        className="text-[10px] font-medium text-zinc-300 truncate block w-full text-center"
        title={is_truncated ? raw : undefined}
      >
        {display}
      </span>
    </div>
  );
}

export const DagConstantNode = memo(function DagConstantNode(props: NodeProps) {
  const [is_popup_open, set_is_popup_open] = useState(false);
  const open_popup = () => set_is_popup_open(true);
  const close_popup = () => set_is_popup_open(false);
  return (
    <>
      <DagConstantNodeInner data={props.data} on_click={open_popup} />
      {is_popup_open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40"
              aria-hidden
              onClick={close_popup}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Constant value"
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-600 bg-zinc-900 shadow-xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2">
                <span className="text-sm font-semibold text-zinc-200">Constant value</span>
                <button
                  type="button"
                  onClick={close_popup}
                  className="rounded p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4 max-h-[70vh] overflow-auto">
                <div className="rounded border border-zinc-700 bg-zinc-800/80 p-3">
                  <JsonTree data={props.data.value} />
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
});

export const DAG_CONSTANT_NODE_WIDTH = BOX_WIDTH;
export const DAG_CONSTANT_NODE_HEIGHT = BOX_HEIGHT;
