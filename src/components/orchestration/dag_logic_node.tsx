"use client";

import { memo, useState, useCallback } from "react";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import { ChevronDown, Check, CircleSlash } from "lucide-react";
import { use_condition_edge_operator, type EnableValue, type EnableValueSingle } from "./dag_edge";

const ROW_HEIGHT = 20;
const PADDING_V = 6;
const BOX_WIDTH = 52;
const BOX_HEIGHT_MIN = 36;

function get_height(input_count: number) {
  return Math.max(BOX_HEIGHT_MIN, PADDING_V * 2 + input_count * ROW_HEIGHT);
}

function DagLogicNodeInner({
  id,
  data,
}: {
  id: string;
  data: {
    op: "and" | "or";
    input_handles: string[];
    target_call_id?: string;
    enable_value?: EnableValue;
  };
}) {
  const { op, input_handles, target_call_id = "", enable_value } = data;
  const height = get_height(input_handles.length);
  const on_change = use_condition_edge_operator();
  const [is_dropdown_open, set_is_dropdown_open] = useState(false);

  const handle_select = useCallback(
    (new_op: "and" | "or" | "pass" | "invert") => {
      if (on_change == null || target_call_id === "" || enable_value == null) return;
      if (typeof enable_value !== "object" || !("operands" in enable_value)) return;
      const current_operands = (enable_value as { operands: EnableValueSingle[] }).operands;
      if (new_op === "and" || new_op === "or") {
        on_change(target_call_id, { op: new_op, operands: current_operands });
      } else if (new_op === "pass" && current_operands[0] != null) {
        const first = current_operands[0];
        const next = { ...first };
        if (next.negate === false) delete (next as Record<string, unknown>).negate;
        on_change(target_call_id, next);
      } else if (new_op === "invert" && current_operands[0] != null) {
        on_change(target_call_id, { ...current_operands[0], negate: true });
      }
      set_is_dropdown_open(false);
    },
    [on_change, target_call_id, enable_value]
  );

  return (
    <div
      className="flex items-stretch rounded-lg border border-zinc-600 bg-zinc-800/90 shadow"
      style={{ minWidth: BOX_WIDTH, width: BOX_WIDTH, minHeight: height, height }}
    >
      <div className="flex flex-col justify-around shrink-0 relative" style={{ width: BOX_WIDTH }}>
        {input_handles.map((handle_id, i) => (
          <Handle
            key={handle_id}
            type="target"
            position={Position.Left}
            id={handle_id}
            className="!h-2 !w-2 !border-2 !border-zinc-600 !bg-zinc-700"
            style={{
              top: input_handles.length === 1 ? "50%" : `${((i + 0.5) * ROW_HEIGHT + PADDING_V) / height * 100}%`,
              left: 0,
              transform: input_handles.length === 1 ? "translateY(-50%)" : "translate(-50%, -50%)",
            }}
          />
        ))}
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="!h-2 !w-2 !border-2 !border-zinc-600 !bg-zinc-700"
          style={{
            top: "50%",
            right: 0,
            transform: "translate(50%, -50%)",
          }}
        />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 nodrag nopan">
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                set_is_dropdown_open((o) => !o);
              }}
              className="flex items-center gap-0.5 rounded border border-transparent hover:border-zinc-500 bg-zinc-800/80 px-1 py-0.5 text-[10px] font-semibold text-zinc-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              aria-label="Logic operator"
              title={`${op.toUpperCase()} – click to change`}
            >
              {op.toUpperCase()}
              <ChevronDown className="h-2.5 w-2.5 text-zinc-500" />
            </button>
            {is_dropdown_open && (
              <>
                <div
                  className="fixed inset-0 z-0"
                  aria-hidden
                  onClick={() => set_is_dropdown_open(false)}
                />
                <div
                  className="absolute left-1/2 top-full z-10 mt-0.5 flex -translate-x-1/2 flex-col rounded border border-zinc-600 bg-zinc-800 py-0.5 shadow-xl min-w-[72px]"
                  role="listbox"
                >
                  <button
                    type="button"
                    role="option"
                    onClick={() => handle_select("and")}
                    className="flex items-center gap-1.5 px-2 py-1 text-left text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    AND
                  </button>
                  <button
                    type="button"
                    role="option"
                    onClick={() => handle_select("or")}
                    className="flex items-center gap-1.5 px-2 py-1 text-left text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    OR
                  </button>
                  <button
                    type="button"
                    role="option"
                    onClick={() => handle_select("pass")}
                    className="flex items-center gap-1.5 px-2 py-1 text-left text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    <Check className="h-2.5 w-2.5" />
                    Pass
                  </button>
                  <button
                    type="button"
                    role="option"
                    onClick={() => handle_select("invert")}
                    className="flex items-center gap-1.5 px-2 py-1 text-left text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
                  >
                    <CircleSlash className="h-2.5 w-2.5" />
                    Invert
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const DagLogicNode = memo(function DagLogicNode(props: NodeProps) {
  return (
    <DagLogicNodeInner
      id={props.id}
      data={props.data as { op: "and" | "or"; input_handles: string[]; target_call_id?: string; enable_value?: EnableValue }}
    />
  );
});

export const DAG_LOGIC_NODE_WIDTH = BOX_WIDTH;
export function get_dag_logic_node_height(input_count: number) {
  return get_height(input_count);
}
