"use client";

import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  Position,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from "reactflow";
import dagre from "@dagrejs/dagre";
import "reactflow/dist/style.css";
import type { Run } from "@/types/orchestration";
import { get_run_dag_edges, get_constant_dag_descriptors, resolve_refs_in_inputs, parse_final_response_ref } from "@/utils/refs";
import { get_agent_color } from "@/utils/agent_color";
import { IMPLEMENTED_AGENT_DOCS, AGENT_DOCS_BY_NAME } from "@/lib/agents";
import { DagNode, get_dag_node_dimensions, get_input_handle_center_y_offset, get_output_handle_center_y_offset, NodeLabelClickProvider, type NodeLabelClickPayload } from "./dag_node";
import { DagConstantNode, DAG_CONSTANT_NODE_WIDTH, DAG_CONSTANT_NODE_HEIGHT } from "./dag_constant_node";
import { DagFinalResponseNode, DAG_FINAL_RESPONSE_NODE_WIDTH, DAG_FINAL_RESPONSE_NODE_HEIGHT } from "./dag_final_response_node";
import { RotateCcw, X, PanelBottomOpen, PanelBottomClose } from "lucide-react";
import { DagEdge, EdgePathModeProvider, type EdgePathMode } from "./dag_edge";
import { JsonTree } from "./json_tree";

const node_types = { dag: DagNode, dag_constant: DagConstantNode, dag_final_response: DagFinalResponseNode };
const edge_types = { dag_edge: DagEdge };

const CONSTANT_NODE_GAP = 28;
const FINAL_RESPONSE_NODE_GAP = 24;

function get_agent_doc_by_name(agent_name: string) {
  return IMPLEMENTED_AGENT_DOCS.find((d) => d.name === agent_name);
}

function get_layouted_nodes_and_edges(
  run_id: string,
  agent_calls: Run["agent_calls"],
  selected_call_id: string | null,
  saved_positions?: Record<string, { x: number; y: number }> | null,
  final_response_ref?: string | null,
  initial_task?: string | null
): { nodes: Node[]; edges: Edge[] } {
  const source_output_handles_by_call_id: Record<string, string[]> = {};
  const source_input_handles_by_call_id: Record<string, string[]> = {};
  const nodes: Node[] = agent_calls.map((call) => {
    const color = get_agent_color(call.agent_name);
    const doc = get_agent_doc_by_name(call.agent_name);
    const doc_inputs = doc ? doc.args.map((a) => a.name) : [];
    const doc_outputs = doc ? Object.keys(doc.output_schema) : [];
    const input_handles = [...new Set([...doc_inputs, ...Object.keys(call.inputs ?? {})])];
    const output_handles = [...new Set(doc_outputs)];
    source_output_handles_by_call_id[call.id] = output_handles;
    source_input_handles_by_call_id[call.id] = input_handles;
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
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      width,
      height,
      selected: selected_call_id === call.id,
    };
  });
  const edges_from_run = get_run_dag_edges(run_id, agent_calls, {
    source_output_handles_by_call_id,
    source_input_handles_by_call_id,
  });
  const call_by_id = new Map(agent_calls.map((c) => [c.id, c]));
  const edges: Edge[] = edges_from_run.map((e, i) => {
    const source_call = e.source_id === "dag_task" ? null : call_by_id.get(e.source_id);
    const stroke = source_call ? get_agent_color(source_call.agent_name).stroke : "rgb(113 113 122)";
    return {
      id: `e-${e.source_id}-${e.source_handle}-${e.target_id}-${e.target_handle}-${i}`,
      source: e.source_id,
      target: e.target_id,
      sourceHandle: e.source_handle,
      targetHandle: e.target_handle,
      type: "dag_edge",
      animated: true,
      style: { stroke },
    };
  });
  const task_edge = edges_from_run.find((e) => e.source_id === "dag_task");
  const task_node: Node | null =
    task_edge && initial_task != null
      ? {
          id: "dag_task",
          type: "dag_constant",
          position: { x: 0, y: 0 },
          data: { value: initial_task, target_call_id: task_edge.target_id },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          width: DAG_CONSTANT_NODE_WIDTH,
          height: DAG_CONSTANT_NODE_HEIGHT,
          selected: false,
          draggable: false,
        }
      : null;
  const constant_descriptors = get_constant_dag_descriptors(agent_calls);
  const constant_nodes: Node[] = constant_descriptors.map((d) => ({
    id: d.id,
    type: "dag_constant",
    position: { x: 0, y: 0 },
    data: { value: d.value },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    width: DAG_CONSTANT_NODE_WIDTH,
    height: DAG_CONSTANT_NODE_HEIGHT,
    selected: false,
  }));
  const constant_edges: Edge[] = constant_descriptors.map((d, i) => ({
    id: `e-const-${d.id}-${d.target_call_id}-${d.target_handle}-${i}`,
    source: d.id,
    target: d.target_call_id,
    sourceHandle: "value",
    targetHandle: d.target_handle,
    type: "dag_edge",
    animated: true,
    style: { stroke: "rgb(113 113 122)" },
  }));
  const final_response_id = "dag_final_response";
  let final_response_node: Node | null = null;
  let final_response_edge: Edge | null = null;
  if (final_response_ref) {
    const parsed = parse_final_response_ref(final_response_ref);
    if (parsed) {
      const source_call_id = agent_calls.some((c) => c.id === `${run_id}-${parsed.ref_call_id}`)
        ? `${run_id}-${parsed.ref_call_id}`
        : agent_calls.find((c) => c.id.endsWith(`-${parsed.ref_call_id}`))?.id;
      if (source_call_id && source_output_handles_by_call_id[source_call_id]?.includes(parsed.output_handle)) {
        final_response_node = {
          id: final_response_id,
          type: "dag_final_response",
          position: { x: 0, y: 0 },
          data: { source_call_id: source_call_id, output_handle: parsed.output_handle },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          width: DAG_FINAL_RESPONSE_NODE_WIDTH,
          height: DAG_FINAL_RESPONSE_NODE_HEIGHT,
          selected: false,
          draggable: false,
        };
        const source_call = call_by_id.get(source_call_id);
        const stroke = source_call ? get_agent_color(source_call.agent_name).stroke : "rgb(34 211 238)";
        final_response_edge = {
          id: `e-final-${source_call_id}-${parsed.output_handle}`,
          source: source_call_id,
          target: final_response_id,
          sourceHandle: parsed.output_handle,
          targetHandle: "final",
          type: "dag_edge",
          animated: true,
          style: { stroke },
        };
      }
    }
  }
  const all_nodes = [
    ...constant_nodes,
    ...(task_node ? [task_node] : []),
    ...nodes,
    ...(final_response_node ? [final_response_node] : []),
  ];
  const all_edges = [...edges, ...constant_edges, ...(final_response_edge ? [final_response_edge] : [])];

  if (all_nodes.length === 0) return { nodes: all_nodes, edges: all_edges };

  const use_saved =
    saved_positions != null &&
    constant_nodes.length === 0 &&
    !task_node &&
    !final_response_node &&
    nodes.every((n) => saved_positions[n.id] != null);

  if (use_saved) {
    const nodes_with_positions = nodes.map((node) => ({
      ...node,
      position: saved_positions![node.id],
    }));
    return { nodes: nodes_with_positions, edges: all_edges };
  }
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    align: "UL",
    ranksep: 110,
    nodesep: 300,
    edgesep: 24,
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

  const agent_positions = new Map<
    string,
    { x: number; y: number; width: number; height: number; input_handles: string[]; output_handles: string[] }
  >();
  nodes.forEach((node) => {
    const pos = g.node(node.id);
    const w = (node.width as number) ?? 244;
    const h = (node.height as number) ?? 40;
    const data = node.data as { input_handles: string[]; output_handles: string[] };
    agent_positions.set(node.id, {
      x: pos.x - w / 2,
      y: pos.y - h / 2,
      width: w,
      height: h,
      input_handles: data.input_handles,
      output_handles: data.output_handles,
    });
  });

  const layouted_nodes = all_nodes.map((node) => {
    const saved = saved_positions?.[node.id];
    if (saved != null) {
      return { ...node, position: saved };
    }
    if (node.type === "dag_constant") {
      const d = constant_descriptors.find((c) => c.id === node.id);
      if (d) {
        const target = agent_positions.get(d.target_call_id);
        if (!target) return { ...node, position: { x: 0, y: 0 } };
        const handle_index = target.input_handles.indexOf(d.target_handle);
        const handle_center_y = target.y + get_input_handle_center_y_offset(target.height, handle_index >= 0 ? handle_index : 0, target.input_handles.length);
        return {
          ...node,
          position: {
            x: target.x - DAG_CONSTANT_NODE_WIDTH - CONSTANT_NODE_GAP,
            y: handle_center_y - DAG_CONSTANT_NODE_HEIGHT / 2,
          },
        };
      }
      if (node.id === "dag_task") {
        const data = node.data as { value: unknown; target_call_id?: string };
        const target = data.target_call_id ? agent_positions.get(data.target_call_id) : undefined;
        if (!target) return { ...node, position: { x: 0, y: 0 } };
        return {
          ...node,
          position: {
            x: target.x - DAG_CONSTANT_NODE_WIDTH - CONSTANT_NODE_GAP,
            y: target.y + target.height / 2 - DAG_CONSTANT_NODE_HEIGHT / 2,
          },
        };
      }
      return { ...node, position: { x: 0, y: 0 } };
    }
    if (node.type === "dag_final_response") {
      const data = node.data as { source_call_id?: string; output_handle?: string };
      const source = data.source_call_id ? agent_positions.get(data.source_call_id) : undefined;
      if (!source || data.output_handle == null) return { ...node, position: { x: 0, y: 0 } };
      const handle_index = source.output_handles.indexOf(data.output_handle);
      const handle_center_y = source.y + get_output_handle_center_y_offset(source.height, handle_index >= 0 ? handle_index : 0, source.output_handles.length);
      return {
        ...node,
        position: {
          x: source.x + source.width + FINAL_RESPONSE_NODE_GAP,
          y: handle_center_y - DAG_FINAL_RESPONSE_NODE_HEIGHT / 2,
        },
      };
    }
    const agent = agent_positions.get(node.id);
    if (agent) {
      return {
        ...node,
        position: { x: agent.x, y: agent.y },
      };
    }
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

  return { nodes: layouted_nodes, edges: all_edges };
}

export function RunDagView({
  run,
  selected_call_id,
  on_select_call,
  on_positions_change,
  on_reset_positions,
  show_calls_panel,
  on_toggle_calls_panel,
}: {
  run: Run;
  selected_call_id: string | null;
  on_select_call: (call_id: string | null) => void;
  on_positions_change?: (run_id: string, positions: Record<string, { x: number; y: number }>) => void;
  on_reset_positions?: (run_id: string) => void;
  show_calls_panel?: boolean;
  on_toggle_calls_panel?: () => void;
}) {
  const { nodes: initial_nodes, edges: initial_edges } = useMemo(
    () =>
      get_layouted_nodes_and_edges(
        run.id,
        run.agent_calls,
        selected_call_id,
        run.dag_node_positions,
        run.final_response_ref,
        run.initial_task
      ),
    [run.id, run.agent_calls, run.dag_node_positions, run.final_response_ref, run.initial_task, selected_call_id]
  );
  const [nodes, set_nodes, on_nodes_change] = useNodesState(initial_nodes);
  const [edges, set_edges, on_edges_change] = useEdgesState(initial_edges);

  useEffect(() => {
    set_nodes(initial_nodes);
    set_edges(initial_edges);
  }, [initial_nodes, initial_edges, set_nodes, set_edges]);

  const handle_node_click = useCallback(
    (_: React.MouseEvent, node: { id: string; type?: string; data?: Record<string, unknown> }) => {
      if (node.type === "dag_final_response") {
        on_select_call(null);
        const source_call_id = node.data?.source_call_id as string | undefined;
        const output_handle = node.data?.output_handle as string | undefined;
        if (source_call_id != null && output_handle != null) {
          const call = run.agent_calls.find((c) => c.id === source_call_id);
          const value = call?.outputs?.[output_handle];
          set_final_response_popup_value({ value });
        }
        return;
      }
      if (node.type === "dag_constant") {
        on_select_call(null);
        return;
      }
      on_select_call(node.id === selected_call_id ? null : node.id);
    },
    [run.agent_calls, selected_call_id, on_select_call]
  );

  const handle_pane_click = useCallback(() => {
    on_select_call(null);
  }, [on_select_call]);

  const handle_node_drag_stop = useCallback(
    (_: React.MouseEvent, dragged_node: Node) => {
      if (on_positions_change == null) return;
      const positions: Record<string, { x: number; y: number }> = {};
      nodes.forEach((n) => {
        if (n.type === "dag_final_response" || n.type === "dag_constant") return;
        positions[n.id] = n.id === dragged_node.id ? dragged_node.position : n.position;
      });
      on_positions_change(run.id, positions);
    },
    [run.id, on_positions_change, nodes]
  );

  const handle_reset_click = useCallback(() => {
    if (on_reset_positions == null) return;
    on_reset_positions(run.id);
    should_fit_view_after_reset_ref.current = true;
  }, [run.id, on_reset_positions]);

  const react_flow_instance_ref = useRef<ReactFlowInstance | null>(null);
  const should_fit_view_after_reset_ref = useRef(false);

  useEffect(() => {
    if (!should_fit_view_after_reset_ref.current) return;
    const instance = react_flow_instance_ref.current;
    if (!instance) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        instance.fitView({ padding: 0.2 });
        should_fit_view_after_reset_ref.current = false;
      });
    });
  }, [nodes]);

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
    definition_type?: string;
    definition_description?: string;
  } | null>(null);

  const [final_response_popup_value, set_final_response_popup_value] = useState<{ value: unknown } | null>(null);

  const handle_node_label_click = useCallback(
    (payload: NodeLabelClickPayload) => {
      const call = run.agent_calls.find((c) => c.id === payload.call_id);
      if (!call) return;
      const doc = get_agent_doc_by_name(call.agent_name);
      let value: unknown;
      let definition_type: string | undefined;
      let definition_description: string | undefined;
      if (payload.type === "output") {
        value = call.outputs?.[payload.handle_name];
        const out_field = doc?.output_schema?.[payload.handle_name];
        definition_type = out_field?.type;
        definition_description = out_field?.description;
      } else {
        const resolved = resolve_refs_in_inputs(run.id, run.agent_calls, call.inputs ?? {}, {
          agent_docs_by_name: AGENT_DOCS_BY_NAME,
          initial_task: run.initial_task,
        });
        value = resolved[payload.handle_name];
        const target_arg = doc?.args?.find((a) => a.name === payload.handle_name);
        definition_type = target_arg?.format;
        definition_description = target_arg?.purpose;
      }
      set_label_popup_data({
        label: payload.handle_name,
        value,
        definition_type,
        definition_description,
      });
    },
    [run]
  );

  return (
    <NodeLabelClickProvider value={handle_node_label_click}>
    <EdgePathModeProvider value={edge_path_mode}>
    <div className="relative h-full min-h-[100px] w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="shrink-0 flex items-center justify-end gap-2 px-2 py-1.5 border-b border-zinc-700/50">
        <div className="flex flex-1" />
        <div className="flex items-center gap-2">
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
        {on_toggle_calls_panel != null && (
          <button
            type="button"
            onClick={on_toggle_calls_panel}
            className="flex items-center justify-center rounded-md p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            aria-label={show_calls_panel ? "Show only DAG" : "Show DAG and agent calls"}
            title={show_calls_panel ? "Show only DAG" : "Show DAG and agent calls"}
          >
            {show_calls_panel ? (
              <PanelBottomClose className="h-4 w-4" />
            ) : (
              <PanelBottomOpen className="h-4 w-4" />
            )}
          </button>
        )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={(instance) => {
          react_flow_instance_ref.current = instance;
        }}
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
                {(label_popup_data.definition_type != null || label_popup_data.definition_description != null) && (
                  <div>
                    <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">Definition</h4>
                    <div className="rounded border border-zinc-700 bg-zinc-800/80 p-3 space-y-1.5">
                      {label_popup_data.definition_type != null && (
                        <p className="text-sm font-mono font-medium text-amber-400">{label_popup_data.definition_type}</p>
                      )}
                      {label_popup_data.definition_description != null && (
                        <p className="text-sm text-zinc-300">{label_popup_data.definition_description}</p>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">Value</h4>
                  <div className="rounded border border-zinc-700 bg-zinc-800/80 p-3 max-h-40 overflow-auto">
                    <JsonTree data={label_popup_data.value} />
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
      {final_response_popup_value != null &&
        createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/50 z-10"
              aria-hidden
              onClick={() => set_final_response_popup_value(null)}
            />
            <div className="fixed left-1/2 top-1/2 z-20 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-600 bg-zinc-900 shadow-xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2">
                <span className="text-sm font-semibold text-cyan-300">Final response</span>
                <button
                  type="button"
                  onClick={() => set_final_response_popup_value(null)}
                  className="rounded p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                <div className="rounded border border-zinc-700 bg-zinc-800/80 p-3">
                  <JsonTree data={final_response_popup_value.value} />
                </div>
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
