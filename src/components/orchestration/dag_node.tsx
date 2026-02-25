"use client";

import { memo, createContext, useContext, useCallback } from "react";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import { CircleDot, Loader2, CheckCircle, XCircle, Play } from "lucide-react";
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

function get_node_height({ input_count, output_count }: { input_count: number; output_count: number }) {
  const rows = Math.max(1, input_count, output_count);
  return Math.max(MIN_BOX_HEIGHT, PADDING_V * 2 + rows * ROW_HEIGHT);
}

export function get_dag_node_dimensions({
  input_handles,
  output_handles,
}: {
  input_handles: string[];
  output_handles: string[];
}) {
  const input_count = input_handles.length;
  const output_count = output_handles.length;
  return {
    width: LEFT_LABEL_WIDTH + BOX_WIDTH + RIGHT_LABEL_WIDTH,
    height: get_node_height({ input_count, output_count }),
  };
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
  };
  selected?: boolean;
}) {
  const { input_handles, output_handles } = data;
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
      className="relative flex items-stretch overflow-visible"
      style={{
        minWidth: LEFT_LABEL_WIDTH + BOX_WIDTH + RIGHT_LABEL_WIDTH,
        width: LEFT_LABEL_WIDTH + BOX_WIDTH + RIGHT_LABEL_WIDTH,
        minHeight: height,
        height,
      }}
    >
      <div
        className="flex flex-col justify-center shrink-0 pr-1 overflow-visible"
        style={{ width: LEFT_LABEL_WIDTH }}
      >
        {input_handles.map((name) => (
          <div key={name} className="flex items-center justify-end" style={{ height: ROW_HEIGHT }}>
            <button
              type="button"
              onClick={() => handle_input_label_click(name)}
              className={`nodrag nopan text-[10px] font-medium truncate text-right w-full ${data.label_class} hover:text-cyan-300 hover:underline focus:outline-none focus:ring-0 cursor-pointer bg-transparent border-0 p-0`}
              title={name}
            >
              {name}
            </button>
          </div>
        ))}
      </div>
      <div
        className={`relative shrink-0 rounded-lg border border-zinc-700 shadow-md ${data.border_class} ${data.badge_class} flex items-center justify-center gap-1.5 px-3 py-2 ${selected ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-zinc-900 border-cyan-500" : ""}`}
        style={{ width: BOX_WIDTH, height }}
      >
        {input_handles.map((name, i) => {
          const is_single = input_count === 1;
          const top_pct = is_single ? 50 : ((i + 0.5) * ROW_HEIGHT + PADDING_V) / height * 100;
          return (
            <Handle
              key={name}
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
          );
        })}
        {output_handles.map((name, i) => {
          const is_single = output_count === 1;
          const top_pct = is_single ? 50 : ((i + 0.5) * ROW_HEIGHT + PADDING_V) / height * 100;
          return (
            <Handle
              key={name}
              type="source"
              position={Position.Right}
              id={name}
              className="!h-2 !w-2 !border-2 !border-zinc-600 !bg-zinc-800"
              style={{
                top: `${top_pct}%`,
                right: 0,
                ...(is_single ? { transform: "translateY(-50%)" } : {}),
              }}
            />
          );
        })}
        <span className={`text-xs font-medium truncate ${data.label_class}`} title={data.label}>
          {data.label}
        </span>
        <StateIcon
          className={`h-3.5 w-3.5 shrink-0 ${state_config.class} ${data.state === "running" ? "animate-spin" : ""}`}
        />
      </div>
      <div
        className="flex flex-col justify-center shrink-0 pl-1 overflow-visible"
        style={{ width: RIGHT_LABEL_WIDTH }}
      >
        {output_handles.map((name) => (
          <div key={name} className="flex items-center" style={{ height: ROW_HEIGHT }}>
            <button
              type="button"
              onClick={() => handle_output_label_click(name)}
              className={`nodrag nopan text-[10px] font-medium truncate w-full text-left ${data.label_class} hover:text-cyan-300 hover:underline focus:outline-none focus:ring-0 cursor-pointer bg-transparent border-0 p-0`}
              title={name}
            >
              {name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export const DagNode = memo(function DagNode(props: NodeProps) {
  return <DagNodeInner id={props.id} data={props.data} selected={props.selected} />;
});

export const DAG_NODE_WIDTH = LEFT_LABEL_WIDTH + BOX_WIDTH + RIGHT_LABEL_WIDTH;
export const DAG_NODE_HEIGHT = MIN_BOX_HEIGHT;
