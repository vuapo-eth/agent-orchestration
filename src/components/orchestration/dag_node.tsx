"use client";

import { memo } from "react";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import { CircleDot, Loader2, CheckCircle, XCircle, Play } from "lucide-react";
import type { AgentCallState } from "@/types/orchestration";

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

const ROW_HEIGHT = 22;
const PADDING_V = 8;
const PADDING_H = 10;
const MIN_HEIGHT = 40;
const LEFT_LABEL_WIDTH = 72;
const CENTER_WIDTH = 100;
const STATE_ICON_WIDTH = 20;
const RIGHT_LABEL_WIDTH = 72;

function get_node_height({ input_count, output_count }: { input_count: number; output_count: number }) {
  const rows = Math.max(1, input_count, output_count);
  return Math.max(MIN_HEIGHT, PADDING_V * 2 + rows * ROW_HEIGHT);
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
    width: LEFT_LABEL_WIDTH + CENTER_WIDTH + STATE_ICON_WIDTH + RIGHT_LABEL_WIDTH,
    height: get_node_height({ input_count, output_count }),
  };
}

function DagNodeInner({
  data,
  selected,
}: {
  data: {
    label: string;
    dot_class: string;
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

  return (
    <div
      className={`relative flex rounded-lg border px-0 py-0 shadow-md bg-zinc-900/80 ${selected ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-zinc-900 border-cyan-500" : "border-zinc-700"}`}
      style={{
        minWidth: LEFT_LABEL_WIDTH + CENTER_WIDTH + STATE_ICON_WIDTH + RIGHT_LABEL_WIDTH,
        width: LEFT_LABEL_WIDTH + CENTER_WIDTH + STATE_ICON_WIDTH + RIGHT_LABEL_WIDTH,
        minHeight: height,
        height,
      }}
    >
      {input_handles.map((name, i) => {
        const top_pct = ((i + 0.5) * ROW_HEIGHT + PADDING_V) / height * 100;
        return (
          <Handle
            key={name}
            type="target"
            position={Position.Left}
            id={name}
            className="!h-2 !w-2 !border-2 !border-zinc-600 !bg-zinc-800"
            style={{ top: `${top_pct}%`, left: 0 }}
          />
        );
      })}
      {output_handles.map((name, i) => {
        const top_pct = ((i + 0.5) * ROW_HEIGHT + PADDING_V) / height * 100;
        return (
          <Handle
            key={name}
            type="source"
            position={Position.Right}
            id={name}
            className="!h-2 !w-2 !border-2 !border-zinc-600 !bg-zinc-800"
            style={{ top: `${top_pct}%`, right: 0 }}
          />
        );
      })}
      <div className="flex flex-1 min-w-0 pointer-events-none">
        <div
          className="flex flex-col justify-center shrink-0 pl-2 pr-0.5"
          style={{ width: LEFT_LABEL_WIDTH }}
        >
          {input_handles.map((name) => (
            <div key={name} className="flex items-center" style={{ height: ROW_HEIGHT }}>
              <span className="text-[10px] font-medium truncate text-zinc-400" title={name}>
                {name}
              </span>
            </div>
          ))}
        </div>
        <div
          className={`flex items-center justify-center shrink-0 rounded border border-zinc-600/80 ${data.dot_class}`}
          style={{ width: CENTER_WIDTH }}
        />
        <div className="flex items-center justify-center shrink-0 w-5" style={{ width: STATE_ICON_WIDTH }}>
          <StateIcon className={`h-3.5 w-3.5 ${state_config.class} ${data.state === "running" ? "animate-spin" : ""}`} />
        </div>
        <div
          className="flex flex-col justify-center shrink-0 pl-2 pr-2"
          style={{ width: RIGHT_LABEL_WIDTH }}
        >
          <div className="flex items-center" style={{ height: ROW_HEIGHT }}>
            <span className={`text-xs font-medium truncate ${data.label_class}`} title={data.label}>
              {data.label}
            </span>
          </div>
          {output_handles.map((name) => (
            <div key={name} className="flex items-center justify-end" style={{ height: ROW_HEIGHT }}>
              <span className="text-[10px] font-medium truncate text-zinc-400 text-right" title={name}>
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const DagNode = memo(function DagNode(props: NodeProps) {
  return <DagNodeInner data={props.data} selected={props.selected} />;
});

export const DAG_NODE_WIDTH = LEFT_LABEL_WIDTH + CENTER_WIDTH + STATE_ICON_WIDTH + RIGHT_LABEL_WIDTH;
export const DAG_NODE_HEIGHT = MIN_HEIGHT;
