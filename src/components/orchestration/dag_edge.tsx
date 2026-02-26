"use client";

import { memo, createContext, useContext, useCallback, useState } from "react";
import type { EdgeProps } from "reactflow";
import { getSmoothStepPath, getBezierPath, getStraightPath, BaseEdge, Position } from "reactflow";
import { ChevronDown, Check, CircleSlash, Trash2 } from "lucide-react";

export type EdgePathMode = "curved" | "straight" | "smoothstep";

export type EnableOperator = "pass" | "invert" | "and" | "or";

export type EnableValueSingle = { ref: string; negate?: boolean };
export type EnableValueOp = { op: "and" | "or"; operands: EnableValueSingle[] };
export type EnableValue = EnableValueSingle | EnableValueOp;

function is_enable_value_single(v: EnableValue): v is EnableValueSingle {
  return v != null && typeof v === "object" && "ref" in v;
}

const EdgePathModeContext = createContext<EdgePathMode>("smoothstep");
const ConditionEdgeOperatorContext = createContext<
  ((call_id: string, new_value: EnableValue) => void) | null
>(null);
const EdgeDeleteContext = createContext<((edge_id: string) => void) | null>(null);

export function use_edge_path_mode() {
  return useContext(EdgePathModeContext);
}

export function use_condition_edge_operator() {
  return useContext(ConditionEdgeOperatorContext);
}

export function use_edge_delete() {
  return useContext(EdgeDeleteContext);
}

export const EdgePathModeProvider = EdgePathModeContext.Provider;
export const ConditionEdgeOperatorProvider = ConditionEdgeOperatorContext.Provider;
export const EdgeDeleteProvider = EdgeDeleteContext.Provider;

function get_path_for_mode(
  mode: EdgePathMode,
  params: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: string;
    targetPosition: string;
    path_offset_index?: number;
    path_offset_total?: number;
  }
): [string, number, number] {
  let { sourceX, sourceY, targetX, targetY } = params;
  const path_offset_index = params.path_offset_index ?? 0;
  const path_offset_total = params.path_offset_total ?? 1;
  if (mode === "smoothstep" && path_offset_total > 1) {
    const spacing = 18;
    const center = (path_offset_total - 1) / 2;
    const offset = (path_offset_index - center) * spacing;
    const is_horizontal =
      params.sourcePosition === "left" || params.sourcePosition === "right";
    if (is_horizontal) {
      sourceY += offset;
      targetY += offset;
    } else {
      sourceX += offset;
      targetX += offset;
    }
  }
  const base = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: params.sourcePosition as Position,
    targetPosition: params.targetPosition as Position,
  };
  if (mode === "curved") {
    const out = getBezierPath({ ...base, curvature: 0.5 });
    return [out[0], out[1], out[2]];
  }
  if (mode === "straight") {
    const out = getStraightPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
    });
    return [out[0], out[1], out[2]];
  }
  const out = getSmoothStepPath({ ...base, borderRadius: 5 });
  return [out[0], out[1], out[2]];
}

const BOX_W = 56;
const BOX_H = 22;
const DELETE_BTN_OFFSET_Y = -28;

function DagConditionEdgeInner(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
    selected,
  } = props;

  const mode = use_edge_path_mode();
  const on_delete_edge = use_edge_delete();
  const [path, label_x, label_y] = get_path_for_mode(mode, {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: sourcePosition ?? "right",
    targetPosition: targetPosition ?? "left",
    path_offset_index: data?.path_offset_index as number | undefined,
    path_offset_total: data?.path_offset_total as number | undefined,
  });

  const target_call_id = (data?.target_call_id as string) ?? "";
  const enable_value = (data?.enable_value as EnableValue) ?? null;
  const on_change = use_condition_edge_operator();
  const is_deletable = (data?.deletable as boolean) !== false;

  const [is_dropdown_open, set_is_dropdown_open] = useState(false);

  const current_operator: EnableOperator = (() => {
    if (enable_value == null || !is_enable_value_single(enable_value)) return "pass";
    if (enable_value.negate === true) return "invert";
    return "pass";
  })();

  const handle_select = useCallback(
    (op: EnableOperator) => {
      if (on_change == null || target_call_id === "" || enable_value == null) return;
      if (!is_enable_value_single(enable_value)) return;
      if (op === "pass") {
        const next = { ...enable_value, negate: false };
        delete (next as Record<string, unknown>).negate;
        on_change(target_call_id, next);
      } else if (op === "invert") {
        on_change(target_call_id, { ...enable_value, negate: true });
      } else {
        on_change(target_call_id, {
          op,
          operands: [{ ...enable_value, negate: enable_value.negate ?? false }],
        });
      }
      set_is_dropdown_open(false);
    },
    [on_change, target_call_id, enable_value]
  );

  const edge_style = {
    ...style,
    ...(selected ? { strokeWidth: 2.5, stroke: "rgb(34 211 238)", filter: "drop-shadow(0 0 4px rgba(34,211,238,0.6))" } : {}),
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={edge_style}
        markerEnd={markerEnd}
      />
      {selected && is_deletable && on_delete_edge != null && (
        <foreignObject
          x={label_x - 14}
          y={label_y + DELETE_BTN_OFFSET_Y}
          width={28}
          height={24}
          className="nodrag nopan"
          style={{ overflow: "visible" }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              on_delete_edge(id);
            }}
            className="flex h-6 w-6 items-center justify-center rounded border border-red-500/80 bg-red-500/20 text-red-400 shadow hover:bg-red-500/30 hover:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-500/50"
            aria-label="Delete edge"
            title="Delete edge"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </foreignObject>
      )}
      <foreignObject
        x={label_x - BOX_W / 2}
        y={label_y - BOX_H / 2}
        width={BOX_W}
        height={BOX_H}
        className="nodrag nopan"
        style={{ overflow: "visible" }}
      >
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: BOX_W,
            height: BOX_H,
          }}
        >
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                set_is_dropdown_open((o) => !o);
              }}
              className="flex items-center gap-0.5 rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-200 shadow hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              aria-label="Condition operator"
              title={current_operator === "pass" ? "Pass through" : current_operator === "invert" ? "Invert" : current_operator}
            >
              {current_operator === "pass" && <Check className="h-2.5 w-2.5" />}
              {current_operator === "invert" && <CircleSlash className="h-2.5 w-2.5" />}
              {(current_operator as EnableOperator) === "and" && "AND"}
              {(current_operator as EnableOperator) === "or" && "OR"}
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
                  className="absolute left-1/2 top-full z-10 mt-0.5 flex -translate-x-1/2 flex-col rounded border border-zinc-600 bg-zinc-800 py-0.5 shadow-xl"
                  role="listbox"
                >
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
                </div>
              </>
            )}
          </div>
        </div>
      </foreignObject>
    </>
  );
}

export const DagConditionEdge = memo(DagConditionEdgeInner);

function DagEdgeInner(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
    selected,
  } = props;

  const mode = use_edge_path_mode();
  const on_delete_edge = use_edge_delete();
  const [path, label_x, label_y] = get_path_for_mode(mode, {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: sourcePosition ?? "right",
    targetPosition: targetPosition ?? "left",
    path_offset_index: data?.path_offset_index as number | undefined,
    path_offset_total: data?.path_offset_total as number | undefined,
  });

  const is_deletable = (data?.deletable as boolean) !== false;

  const edge_style = {
    ...style,
    ...(selected ? { strokeWidth: 2.5, stroke: "rgb(34 211 238)", filter: "drop-shadow(0 0 4px rgba(34,211,238,0.6))" } : {}),
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={edge_style}
        markerEnd={markerEnd}
      />
      {selected && is_deletable && on_delete_edge != null && (
        <foreignObject
          x={label_x - 14}
          y={label_y + DELETE_BTN_OFFSET_Y}
          width={28}
          height={24}
          className="nodrag nopan"
          style={{ overflow: "visible" }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              on_delete_edge(id);
            }}
            className="flex h-6 w-6 items-center justify-center rounded border border-red-500/80 bg-red-500/20 text-red-400 shadow hover:bg-red-500/30 hover:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-500/50"
            aria-label="Delete edge"
            title="Delete edge"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </foreignObject>
      )}
    </>
  );
}

export const DagEdge = memo(DagEdgeInner);
