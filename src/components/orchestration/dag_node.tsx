"use client";

import { memo, createContext, useContext, useCallback, useMemo, Fragment } from "react";
import type { NodeProps } from "reactflow";
import { Handle, Position, useEdges } from "reactflow";
import { CircleDot, Loader2, CheckCircle, XCircle, Play, Check, X } from "lucide-react";
import type { AgentCallState } from "@/types/orchestration";

export type NodeLabelClickPayload = {
  type: "input" | "output";
  call_id: string;
  handle_name: string;
};

const NodeLabelClickContext = createContext<((payload: NodeLabelClickPayload) => void) | null>(null);

export function use_node_label_click() {
  return useContext(NodeLabelClickContext);
}

export const NodeLabelClickProvider = NodeLabelClickContext.Provider;

const STATE_CONFIG: Record<
  AgentCallState,
  { icon: typeof CircleDot; class: string }
> = {
  queued: { icon: CircleDot, class: "text-zinc-500" },
  ready: { icon: Play, class: "text-cyan-400" },
  running: { icon: Loader2, class: "text-amber-400" },
  finished: { icon: CheckCircle, class: "text-emerald-500" },
  error: { icon: XCircle, class: "text-red-400" },
};

const ROW_HEIGHT = 20;
const PADDING_V = 6;
const MIN_BOX_HEIGHT = 36;
const BOX_WIDTH = 120;
const LEFT_LABEL_WIDTH = 76;
const RIGHT_LABEL_WIDTH = 76;

function get_node_height({
  input_count,
  output_count,
}: {
  input_count: number;
  output_count: number;
}) {
  const rows = Math.max(1, input_count, output_count);
  return Math.max(MIN_BOX_HEIGHT, PADDING_V * 2 + rows * ROW_HEIGHT);
}

export function get_dag_node_dimensions({
  input_handles,
  output_handles,
  show_port_labels = true,
}: {
  input_handles: string[];
  output_handles: string[];
  show_port_labels?: boolean;
}) {
  const input_count = input_handles.length;
  const output_count = output_handles.length;
  const label_width = show_port_labels ? LEFT_LABEL_WIDTH + RIGHT_LABEL_WIDTH : 0;
  return {
    width: label_width + BOX_WIDTH,
    height: get_node_height({ input_count, output_count }),
  };
}

export function get_input_handle_center_y_offset(
  node_height: number,
  handle_index: number,
  input_count: number
): number {
  if (input_count <= 0) return node_height / 2;
  if (input_count === 1) return node_height / 2;
  return (handle_index + 0.5) * ROW_HEIGHT + PADDING_V;
}

export function get_output_handle_center_y_offset(
  node_height: number,
  handle_index: number,
  output_count: number
): number {
  if (output_count <= 0) return node_height / 2;
  if (output_count === 1) return node_height / 2;
  return (node_height - output_count * ROW_HEIGHT) / 2 + (handle_index + 0.5) * ROW_HEIGHT;
}

function DagNodeInner({
  id,
  data,
  selected,
}: {
  id: string;
  data: {
    label: string;
    badge_class: string;
    border_class: string;
    label_class: string;
    state: AgentCallState;
    input_handles: string[];
    output_handles: string[];
    show_enable_port?: boolean;
    show_port_labels?: boolean;
    resolved_enable?: boolean;
    is_blocked_by_condition?: boolean;
    output_has_result?: Record<string, boolean>;
  };
  selected?: boolean;
}) {
  const { input_handles, output_handles } = data;
  const show_port_labels = data.show_port_labels !== false;
  const left_label_width = show_port_labels ? LEFT_LABEL_WIDTH : 0;
  const right_label_width = show_port_labels ? RIGHT_LABEL_WIDTH : 0;
  const total_width = left_label_width + BOX_WIDTH + right_label_width;
  const edges = useEdges();
  const used_output_handles = useMemo(() => {
    const used = new Set<string>();
    for (const edge of edges) {
      if (edge.source !== id) continue;
      const sh = edge.sourceHandle;
      if (sh != null && typeof sh === "string" && !sh.startsWith("input:")) {
        used.add(sh);
      }
    }
    return used;
  }, [id, edges]);
  const input_count = input_handles.length;
  const output_count = output_handles.length;
  const height = get_node_height({ input_count, output_count });
  const state_config = STATE_CONFIG[data.state];
  const StateIcon = state_config.icon;
  const on_label_click = use_node_label_click();

  const handle_input_label_click = useCallback(
    (name: string) => {
      on_label_click?.({ type: "input", call_id: id, handle_name: name });
    },
    [id, on_label_click]
  );

  const handle_output_label_click = useCallback(
    (name: string) => {
      on_label_click?.({ type: "output", call_id: id, handle_name: name });
    },
    [id, on_label_click]
  );

  return (
    <div
      className={`relative flex items-stretch overflow-visible ${data.is_blocked_by_condition ? "opacity-50" : ""}`}
      style={{
        minWidth: total_width,
        width: total_width,
        minHeight: height,
        height,
      }}
    >
      {data.show_enable_port !== false && (
        <div
          className="absolute z-[11]"
          style={{
            left: left_label_width + BOX_WIDTH / 2 - 8,
            top: -8,
            width: 16,
            height: 16,
          }}
        >
          <Handle
            type="target"
            position={Position.Top}
            id="__enable"
            className="!min-h-0 !min-w-0 !rounded-full !border-0 !bg-transparent !m-0 !inset-0 !translate-x-0 !translate-y-0 !w-full !h-full !z-0 !opacity-0"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 16,
              height: 16,
              zIndex: 0,
            }}
          />
          <div
            className="absolute inset-0 rounded-full border-2 border-zinc-600 bg-zinc-800/80 flex items-center justify-center pointer-events-none"
            style={{ zIndex: 1 }}
            aria-hidden
          >
            {data.resolved_enable === true && (
              <Check className="h-2.5 w-2.5 text-emerald-500 shrink-0" strokeWidth={2.5} />
            )}
            {data.resolved_enable === false && (
              <X className="h-2.5 w-2.5 text-red-500 shrink-0" strokeWidth={2.5} />
            )}
          </div>
        </div>
      )}
      {show_port_labels ? (
        <div
          className="flex flex-col justify-center shrink-0 pr-1 overflow-visible"
          style={{ width: LEFT_LABEL_WIDTH }}
        >
          {input_handles.map((name) => (
            <div key={name} className="flex items-center justify-end" style={{ height: ROW_HEIGHT }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handle_input_label_click(name);
                }}
                className={`nodrag nopan text-[10px] font-medium truncate text-right w-full ${data.label_class} hover:text-cyan-300 hover:underline focus:outline-none focus:ring-0 cursor-pointer bg-transparent border-0 p-0`}
                title={name}
              >
                {name}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div
        className={`relative shrink-0 rounded-lg border shadow-md ${data.border_class} ${data.badge_class} flex items-center justify-center gap-1.5 px-3 py-2 ${data.state === "error" ? "border-4 border-red-500 ring-2 ring-red-500/80" : selected ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-zinc-900 border-cyan-500" : "border border-zinc-700"}`}
        style={{ width: BOX_WIDTH, height }}
      >
        {input_handles.map((name, i) => {
          const is_single = input_count === 1;
          const top_px = is_single ? height / 2 : (height - input_count * ROW_HEIGHT) / 2 + (i + 0.5) * ROW_HEIGHT;
          const top_pct = (top_px / height) * 100;
          return (
            <Fragment key={name}>
              <Handle
                type="target"
                position={Position.Left}
                id={name}
                className="!h-2 !w-2 !border-2 !border-zinc-600 !bg-zinc-800"
                style={{
                  top: `${top_pct}%`,
                  left: 0,
                  ...(is_single ? { transform: "translateY(-50%)" } : {}),
                }}
              />
              <Handle
                type="source"
                position={Position.Left}
                id={`input:${name}`}
                className="!h-2 !w-2 !border-2 !border-zinc-600 !bg-zinc-800"
                style={{
                  top: `${top_pct}%`,
                  left: 0,
                  ...(is_single ? { transform: "translateY(-50%)" } : {}),
                }}
              />
            </Fragment>
          );
        })}
        {output_handles.map((name, i) => {
          const is_single = output_count === 1;
          const top_px = is_single ? height / 2 : (height - output_count * ROW_HEIGHT) / 2 + (i + 0.5) * ROW_HEIGHT;
          const top_pct = (top_px / height) * 100;
          const has_result = data.output_has_result?.[name] === true;
          return (
            <Handle
              key={name}
              type="source"
              position={Position.Right}
              id={name}
              className={
                has_result
                  ? "!h-2 !w-2 !border-2 !border-emerald-500 !bg-emerald-500"
                  : "!h-2 !w-2 !border-2 !border-zinc-600 !bg-zinc-800"
              }
              style={{
                top: `${top_pct}%`,
                right: 0,
                ...(is_single ? { transform: "translateY(-50%)" } : {}),
              }}
            />
          );
        })}
        <span className={`text-xs font-medium break-words text-center max-w-full ${data.label_class}`} title={data.label}>
          {data.label}
        </span>
        <StateIcon
          className={`h-3.5 w-3.5 shrink-0 ${state_config.class} ${data.state === "running" ? "animate-spin" : ""}`}
        />
      </div>
      {show_port_labels ? (
        <div
          className="flex flex-col justify-center shrink-0 pl-1 overflow-visible"
          style={{ width: RIGHT_LABEL_WIDTH }}
        >
          {output_handles.map((name) => {
            const is_used = used_output_handles.has(name);
            const has_result = data.output_has_result?.[name] === true;
            return (
              <div key={name} className="flex items-center gap-1" style={{ height: ROW_HEIGHT }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handle_output_label_click(name);
                  }}
                  className={`nodrag nopan text-[10px] font-medium truncate min-w-0 flex-1 text-left ${data.label_class} hover:text-cyan-300 hover:underline focus:outline-none focus:ring-0 cursor-pointer bg-transparent border-0 p-0`}
                  style={{ opacity: is_used || has_result ? undefined : 0.3 }}
                  title={name}
                >
                  {name}
                </button>
                {has_result && (
                  <Check className="h-2.5 w-2.5 text-emerald-500 shrink-0" strokeWidth={2.5} aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export const DagNode = memo(function DagNode(props: NodeProps) {
  return <DagNodeInner id={props.id} data={props.data} selected={props.selected} />;
});

export const DAG_NODE_WIDTH = LEFT_LABEL_WIDTH + BOX_WIDTH + RIGHT_LABEL_WIDTH;
export const DAG_NODE_HEIGHT = MIN_BOX_HEIGHT;
