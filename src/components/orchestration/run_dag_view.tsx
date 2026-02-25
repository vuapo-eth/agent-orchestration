"use client";

import { useMemo, useCallback, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  type Node,
  type Edge,
} from "reactflow";
import dagre from "@dagrejs/dagre";
import "reactflow/dist/style.css";
import type { Run } from "@/types/orchestration";
import { get_run_dag_edges } from "@/utils/refs";
import { get_agent_color } from "@/utils/agent_color";
import { IMPLEMENTED_AGENT_DOCS } from "@/lib/agents";
import { DagNode, get_dag_node_dimensions } from "./dag_node";

const node_types = { dag: DagNode };

function get_agent_doc_by_name(agent_name: string) {
  return IMPLEMENTED_AGENT_DOCS.find((d) => d.name === agent_name);
}

function get_layouted_nodes_and_edges(
  run_id: string,
  agent_calls: Run["agent_calls"],
  selected_call_id: string | null
): { nodes: Node[]; edges: Edge[] } {
  const edges_from_run = get_run_dag_edges(run_id, agent_calls);
  const nodes: Node[] = agent_calls.map((call) => {
    const color = get_agent_color(call.agent_name);
    const doc = get_agent_doc_by_name(call.agent_name);
    const input_handles = doc ? doc.args.map((a) => a.name) : [];
    const output_handles = doc ? Object.keys(doc.output_schema) : [];
    const { width, height } = get_dag_node_dimensions({ input_handles, output_handles });
    return {
      id: call.id,
      type: "dag",
      position: { x: 0, y: 0 },
      data: {
        label: call.agent_name,
        dot_class: color.dot,
        label_class: color.label,
        state: call.state,
        input_handles,
        output_handles,
      },
      sourcePosition: "right" as const,
      targetPosition: "left" as const,
      width,
      height,
      selected: selected_call_id === call.id,
    };
  });
  const edges: Edge[] = edges_from_run.map((e, i) => ({
    id: `e-${e.source_id}-${e.source_handle}-${e.target_id}-${e.target_handle}-${i}`,
    source: e.source_id,
    target: e.target_id,
    sourceHandle: e.source_handle,
    targetHandle: e.target_handle,
    type: "smoothstep",
    animated: true,
    style: { stroke: "rgb(113 113 122)" },
  }));

  if (nodes.length === 0) return { nodes, edges };

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 48, nodesep: 24 });

  nodes.forEach((n) => {
    const w = (n.width as number) ?? 244;
    const h = (n.height as number) ?? 40;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  const layouted_nodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const w = (node.width as number) ?? 244;
    const h = (node.height as number) ?? 40;
    return {
      ...node,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });

  return { nodes: layouted_nodes, edges };
}

export function RunDagView({
  run,
  selected_call_id,
  on_select_call,
}: {
  run: Run;
  selected_call_id: string | null;
  on_select_call: (call_id: string | null) => void;
}) {
  const { nodes: initial_nodes, edges: initial_edges } = useMemo(
    () => get_layouted_nodes_and_edges(run.id, run.agent_calls, selected_call_id),
    [run.id, run.agent_calls, selected_call_id]
  );
  const [nodes, set_nodes, on_nodes_change] = useNodesState(initial_nodes);
  const [edges, , on_edges_change] = useEdgesState(initial_edges);

  useEffect(() => {
    set_nodes(initial_nodes);
  }, [initial_nodes, set_nodes]);

  const handle_node_click = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      on_select_call(node.id === selected_call_id ? null : node.id);
    },
    [selected_call_id, on_select_call]
  );

  const handle_pane_click = useCallback(() => {
    on_select_call(null);
  }, [on_select_call]);

  return (
    <div className="h-[220px] w-full shrink-0 rounded-lg border border-zinc-700/60 bg-zinc-900/50 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={on_nodes_change}
        onEdgesChange={on_edges_change}
        onNodeClick={handle_node_click}
        onPaneClick={handle_pane_click}
        nodeTypes={node_types}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        minZoom={0.3}
        maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={12} size={1} color="rgb(63 63 70)" />
        <Controls
          showInteractive={false}
          className="!bottom-2 !top-auto !bg-zinc-800/90 !border-zinc-600"
        />
      </ReactFlow>
    </div>
  );
}
