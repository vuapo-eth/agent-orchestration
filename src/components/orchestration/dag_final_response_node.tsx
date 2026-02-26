"use client";

import { memo } from "react";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import { MessageSquare } from "lucide-react";

const WIDTH = 100;
const HEIGHT = 32;

function DagFinalResponseNodeInner({ data }: { data: Record<string, never> }) {
  return (
    <div
      className="rounded-md border-2 border-cyan-500/80 bg-cyan-950/80 shadow flex items-center justify-center gap-1.5 px-2 py-1.5"
      style={{ width: WIDTH, height: HEIGHT }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="final"
        className="!h-2 !w-2 !border-2 !border-cyan-500 !bg-cyan-600"
        style={{ left: 0, top: "50%", transform: "translateY(-50%)" }}
      />
      <MessageSquare className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
      <span className="text-xs font-medium text-cyan-200 truncate">Final response</span>
    </div>
  );
}

export const DagFinalResponseNode = memo(function DagFinalResponseNode(props: NodeProps) {
  return <DagFinalResponseNodeInner data={props.data} />;
});

export const DAG_FINAL_RESPONSE_NODE_WIDTH = WIDTH;
export const DAG_FINAL_RESPONSE_NODE_HEIGHT = HEIGHT;
