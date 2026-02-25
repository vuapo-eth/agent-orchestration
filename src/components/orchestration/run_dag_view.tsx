"use client";

import { useMemo, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import { get_run_dag_edges, resolve_refs_in_inputs } from "@/utils/refs";
import { get_agent_color } from "@/utils/agent_color";
import { IMPLEMENTED_AGENT_DOCS, AGENT_DOCS_BY_NAME } from "@/lib/agents";
import { DagNode, get_dag_node_dimensions, NodeLabelClickProvider, type NodeLabelClickPayload } from "./dag_node";
import { RotateCcw, X } from "lucide-react";
import { DagEdge, EdgePathModeProvider, type EdgePathMode } from "./dag_edge";
import { JsonTree } from "./json_tree";

const node_types = { dag: DagNode };
const edge_types = { dag_edge: DagEdge };

function get_agent_doc_by_name(agent_name: string) {
  return IMPLEMENTED_AGENT_DOCS.find((d) => d.name === agent_name);
}

function get_layouted_nodes_and_edges(
  run_id: string,
  agent_calls: Run["agent_calls"],
  selected_call_id: string | null,
  saved_positions?: Record<string, { x: number; y: number }> | null
): { nodes: Node[]; edges: Edge[] } {
  const edges_from_run = get_run_dag_edges(run_id, agent_calls);
  const nodes: Node[] = agent_calls.map((call) => {
    const color = get_agent_color(call.agent_name);
    const doc = get_agent_doc_by_name(call.agent_name);
    const doc_inputs = doc ? doc.args.map((a) => a.name) : [];
    const doc_outputs = doc ? Object.keys(doc.output_schema) : [];
    const input_handles = [...new Set([...doc_inputs, ...Object.keys(call.inputs ?? {})])];
    const output_handles = [...new Set([...doc_outputs, "outputs"])];
    const { width, height } = get_dag_node_dimensions({ input_handles, output_handles });
    return {
      id: call.id,
      type: "dag",
      position: { x: 0, y: 0 },
      data: {
        label: call.agent_name,
        badge_class: color.badge,
        border_class: color.border,
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
    type: "dag_edge",
    animated: true,
    style: { stroke: "rgb(113 113 122)" },
  }));

  if (nodes.length === 0) return { nodes, edges };

  const use_saved =
    saved_positions != null &&
    nodes.every((n) => saved_positions[n.id] != null);

  if (use_saved) {
    const nodes_with_positions = nodes.map((node) => ({
      ...node,
      position: saved_positions![node.id],
    }));
    return { nodes: nodes_with_positions, edges };
  }

  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    align: "UL",
    ranksep: 72,
    nodesep: 48,
    edgesep: 16,
  });

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
  on_positions_change,
  on_reset_positions,
}: {
  run: Run;
  selected_call_id: string | null;
  on_select_call: (call_id: string | null) => void;
  on_positions_change?: (run_id: string, positions: Record<string, { x: number; y: number }>) => void;
  on_reset_positions?: (run_id: string) => void;
}) {
  const { nodes: initial_nodes, edges: initial_edges } = useMemo(
    () =>
      get_layouted_nodes_and_edges(
        run.id,
        run.agent_calls,
        selected_call_id,
        run.dag_node_positions
      ),
    [run.id, run.agent_calls, run.dag_node_positions, selected_call_id]
  );
  const [nodes, set_nodes, on_nodes_change] = useNodesState(initial_nodes);
  const [edges, set_edges, on_edges_change] = useEdgesState(initial_edges);

  useEffect(() => {
    set_nodes(initial_nodes);
    set_edges(initial_edges);
  }, [initial_nodes, initial_edges, set_nodes, set_edges]);

  const handle_node_click = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      on_select_call(node.id === selected_call_id ? null : node.id);
    },
    [selected_call_id, on_select_call]
  );

  const handle_pane_click = useCallback(() => {
    on_select_call(null);
  }, [on_select_call]);

  const handle_node_drag_stop = useCallback(
    (_: React.MouseEvent, dragged_node: Node) => {
      if (on_positions_change == null) return;
      const positions: Record<string, { x: number; y: number }> = {};
      nodes.forEach((n) => {
        positions[n.id] = n.id === dragged_node.id ? dragged_node.position : n.position;
      });
      on_positions_change(run.id, positions);
    },
    [run.id, on_positions_change, nodes]
  );

  const handle_reset_click = useCallback(() => {
    if (on_reset_positions == null) return;
    on_reset_positions(run.id);
  }, [run.id, on_reset_positions]);

  const [edge_path_mode, set_edge_path_mode] = useState<EdgePathMode>("smoothstep");

  const connection_line_type =
    edge_path_mode === "curved"
      ? ConnectionLineType.Bezier
      : edge_path_mode === "straight"
        ? ConnectionLineType.Straight
        : ConnectionLineType.SmoothStep;

  const [label_popup_data, set_label_popup_data] = useState<{
    label: string;
    value: unknown;
    source_definition?: string;
    target_definition?: string;
  } | null>(null);

  const handle_node_label_click = useCallback(
    (payload: NodeLabelClickPayload) => {
      const call = run.agent_calls.find((c) => c.id === payload.call_id);
      if (!call) return;
      const doc = get_agent_doc_by_name(call.agent_name);
      let value: unknown;
      let source_definition: string | undefined;
      let target_definition: string | undefined;
      if (payload.type === "output") {
        value =
          payload.handle_name === "outputs"
            ? call.outputs
            : call.outputs?.[payload.handle_name];
        source_definition = doc?.output_schema?.[payload.handle_name]?.description;
      } else {
        const resolved = resolve_refs_in_inputs(run.id, run.agent_calls, call.inputs ?? {}, {
          agent_docs_by_name: AGENT_DOCS_BY_NAME,
        });
        value = resolved[payload.handle_name];
        const target_arg = doc?.args?.find((a) => a.name === payload.handle_name);
        target_definition = target_arg ? `${target_arg.purpose} (${target_arg.format})` : undefined;
      }
      set_label_popup_data({
        label: payload.handle_name,
        value,
        source_definition,
        target_definition,
      });
    },
    [run]
  );

  return (
    <NodeLabelClickProvider value={handle_node_label_click}>
    <EdgePathModeProvider value={edge_path_mode}>
    <div className="relative h-full min-h-[100px] w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="shrink-0 flex items-center justify-end gap-2 px-2 py-1.5 border-b border-zinc-700/50">
        <div className="flex rounded-md border border-zinc-600 overflow-hidden" role="group" aria-label="Edge style">
          {(["smoothstep", "curved", "straight"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set_edge_path_mode(mode)}
              className={`px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:ring-inset ${
                edge_path_mode === mode
                  ? "bg-zinc-600 text-zinc-100"
                  : "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
              }`}
            >
              {mode === "smoothstep" ? "Step" : mode === "curved" ? "Curved" : "Straight"}
            </button>
          ))}
        </div>
        {on_reset_positions != null && (
          <button
            type="button"
            onClick={handle_reset_click}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset layout
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={on_nodes_change}
        onEdgesChange={on_edges_change}
        onNodeClick={handle_node_click}
        onNodeDragStop={handle_node_drag_stop}
        onPaneClick={handle_pane_click}
        nodeTypes={node_types}
        edgeTypes={edge_types}
        connectionLineType={connection_line_type}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={true}
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
          className="dag-controls-dark !bottom-2 !top-auto !bg-zinc-800/90 !border-zinc-600"
        />
      </ReactFlow>
      </div>
      {label_popup_data != null &&
        createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/50 z-10"
              aria-hidden
              onClick={() => set_label_popup_data(null)}
            />
            <div className="fixed left-1/2 top-1/2 z-20 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-600 bg-zinc-900 shadow-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2">
                <span className="text-sm font-semibold text-cyan-300">{label_popup_data.label}</span>
                <button
                  type="button"
                  onClick={() => set_label_popup_data(null)}
                  className="rounded p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">Value</h4>
                  <div className="rounded border border-zinc-700 bg-zinc-800/80 p-3 max-h-40 overflow-auto">
                    <JsonTree data={label_popup_data.value} />
                  </div>
                </div>
                {label_popup_data.source_definition != null && (
                  <div>
                    <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">Output (source) definition</h4>
                    <p className="text-sm text-zinc-300">{label_popup_data.source_definition}</p>
                  </div>
                )}
                {label_popup_data.target_definition != null && (
                  <div>
                    <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">Input (target) definition</h4>
                    <p className="text-sm text-zinc-300">{label_popup_data.target_definition}</p>
                  </div>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
    </EdgePathModeProvider>
    </NodeLabelClickProvider>
  );
}
