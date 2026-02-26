"use client";

import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  ConnectionMode,
  Position,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
} from "reactflow";
import dagre from "@dagrejs/dagre";
import "reactflow/dist/style.css";
import type { Run } from "@/types/orchestration";
import { get_run_dag_edges, get_constant_dag_descriptors, resolve_refs_in_inputs, parse_final_response_ref, is_enabled, type ConstantDagDescriptor } from "@/utils/refs";
import { get_agent_color } from "@/utils/agent_color";
import { IMPLEMENTED_AGENT_DOCS, AGENT_DOCS_BY_NAME } from "@/lib/agents";
import { DagNode, get_dag_node_dimensions, get_input_handle_center_y_offset, get_output_handle_center_y_offset, NodeLabelClickProvider, type NodeLabelClickPayload } from "./dag_node";
import { DagConstantNode, DAG_CONSTANT_NODE_WIDTH, DAG_CONSTANT_NODE_HEIGHT } from "./dag_constant_node";
import { DagFinalResponseNode, DAG_FINAL_RESPONSE_NODE_WIDTH, DAG_FINAL_RESPONSE_NODE_HEIGHT } from "./dag_final_response_node";
import { RotateCcw, X, PanelBottomOpen, PanelBottomClose, Trash2, Undo2, Redo2, Workflow, Spline, Minus } from "lucide-react";
import { DagEdge, DagConditionEdge, EdgePathModeProvider, ConditionEdgeOperatorProvider, EdgeDeleteProvider, type EdgePathMode, type EnableValue } from "./dag_edge";
import { DagLogicNode, DAG_LOGIC_NODE_WIDTH, get_dag_logic_node_height } from "./dag_logic_node";
import { JsonTree } from "./json_tree";

const node_types = { dag: DagNode, dag_constant: DagConstantNode, dag_final_response: DagFinalResponseNode, dag_logic: DagLogicNode };
const edge_types = { dag_edge: DagEdge, dag_condition_edge: DagConditionEdge };

function add_step_edge_offsets(edges: Edge[]): Edge[] {
  const path_key = (e: Edge) => `${e.source}\t${e.target}`;
  const by_path = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = path_key(e);
    if (!by_path.has(key)) by_path.set(key, []);
    by_path.get(key)!.push(e);
  }
  return edges.map((e) => {
    const group = by_path.get(path_key(e))!;
    const path_offset_index = group.indexOf(e);
    const path_offset_total = group.length;
    if (path_offset_total <= 1) return e;
    return {
      ...e,
      data: {
        ...(e.data ?? {}),
        path_offset_index,
        path_offset_total,
      },
    };
  });
}

const VALIDATOR_AGENT_NAME = "Execution validator";

export type DagViewMode = "simple" | "guardrail";

export type DataDepsMode = "simplified" | "detailed";

function get_guardrail_call_ids(agent_calls: Run["agent_calls"]): Set<string> {
  return new Set(agent_calls.filter((c) => c.agent_name === VALIDATOR_AGENT_NAME).map((c) => c.id));
}

const CONSTANT_NODE_GAP = 28;
const FINAL_RESPONSE_NODE_GAP = 24;

function get_agent_doc_by_name(agent_name: string) {
  return IMPLEMENTED_AGENT_DOCS.find((d) => d.name === agent_name);
}

function normalize_enable_value_single(v: unknown): EnableValue | null {
  if (v == null) return null;
  if (typeof v === "object" && "op" in v && (v as { op: string }).op === "and") return null;
  if (typeof v === "object" && "op" in v && (v as { op: string }).op === "or") return null;
  if (typeof v === "object" && "ref" in v && typeof (v as { ref: unknown }).ref === "string") {
    const o = v as { ref: string; negate?: boolean };
    return { ref: o.ref, ...(o.negate === true ? { negate: true } : {}) };
  }
  if (typeof v === "string" && v.length > 0) return { ref: v };
  return null;
}

function get_layouted_nodes_and_edges(
  run_id: string,
  agent_calls: Run["agent_calls"],
  selected_call_id: string | null,
  saved_positions?: Record<string, { x: number; y: number }> | null,
  final_response_ref?: string | null,
  initial_task?: string | null,
  view_mode: DagViewMode = "guardrail",
  data_deps_mode: DataDepsMode = "detailed"
): { nodes: Node[]; edges: Edge[] } {
  const guardrail_ids = view_mode === "simple" ? get_guardrail_call_ids(agent_calls) : new Set<string>();
  const is_simple = view_mode === "simple";
  const is_simplified_deps = data_deps_mode === "simplified";

  const source_output_handles_by_call_id: Record<string, string[]> = {};
  const source_input_handles_by_call_id: Record<string, string[]> = {};
  for (const call of agent_calls) {
    const doc = get_agent_doc_by_name(call.agent_name);
    const doc_inputs = doc ? doc.args.map((a) => a.name) : [];
    const doc_outputs = doc ? Object.keys(doc.output_schema) : [];
    source_output_handles_by_call_id[call.id] = [...new Set(doc_outputs)];
    source_input_handles_by_call_id[call.id] = [...new Set([...doc_inputs, ...Object.keys(call.inputs ?? {})])].filter((h) => h !== "__enable");
  }
  const agent_nodes_source = agent_calls.filter((call) => !guardrail_ids.has(call.id));
  const nodes: Node[] = agent_nodes_source.map((call) => {
    const color = get_agent_color(call.agent_name);
    const doc = get_agent_doc_by_name(call.agent_name);
    const doc_inputs = doc ? doc.args.map((a) => a.name) : [];
    const doc_outputs = doc ? Object.keys(doc.output_schema) : [];
    const input_handles = is_simplified_deps
      ? ["data"]
      : [...new Set([...doc_inputs, ...Object.keys(call.inputs ?? {})])].filter((h) => h !== "__enable");
    const output_handles = is_simplified_deps ? ["data"] : [...new Set(doc_outputs)];
    const show_port_labels = !is_simplified_deps;
    const { width, height } = get_dag_node_dimensions({ input_handles, output_handles, show_port_labels });
    const has_enable = call.inputs != null && "__enable" in call.inputs;
    const resolved_enable = has_enable
      ? is_enabled(run_id, agent_calls, call, { agent_docs_by_name: AGENT_DOCS_BY_NAME, initial_task: initial_task ?? undefined })
      : undefined;
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
        show_enable_port: !is_simple,
        show_port_labels,
        resolved_enable,
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
  const edges_filtered = is_simple
    ? edges_from_run.filter(
        (e) =>
          (e.target_handle !== "__enable" || e.source_id.startsWith("logic_")) &&
          !e.source_id.startsWith("logic_") &&
          !e.target_id.startsWith("logic_") &&
          !guardrail_ids.has(e.source_id) &&
          !guardrail_ids.has(e.target_id)
      )
    : edges_from_run;
  const call_by_id = new Map(agent_calls.map((c) => [c.id, c]));
  let edges: Edge[];
  if (is_simplified_deps) {
    const data_edges = edges_filtered.filter(
      (e) =>
        e.target_handle !== "__enable" &&
        !e.source_id.startsWith("logic_") &&
        !e.target_id.startsWith("logic_") &&
        !guardrail_ids.has(e.source_id) &&
        !guardrail_ids.has(e.target_id)
    );
    const pair_key = (a: string, b: string) => `${a}\t${b}`;
    const seen_pairs = new Set<string>();
    const collapsed: typeof edges_filtered = [];
    for (const e of data_edges) {
      const key = pair_key(e.source_id, e.target_id);
      if (seen_pairs.has(key)) continue;
      seen_pairs.add(key);
      const is_task_source = e.source_id === "dag_task";
      collapsed.push({
        source_id: e.source_id,
        source_handle: is_task_source ? "value" : "data",
        target_id: e.target_id,
        target_handle: "data",
      });
    }
    edges = collapsed.map((e, i) => {
      const is_conditional = false;
      const source_call = e.source_id === "dag_task" ? null : call_by_id.get(e.source_id);
      const stroke = source_call ? get_agent_color(source_call.agent_name).stroke : "rgb(113 113 122)";
      return {
        id: `e-${e.source_id}-${e.target_id}-data-${i}`,
        source: e.source_id,
        target: e.target_id,
        sourceHandle: e.source_handle,
        targetHandle: e.target_handle,
        type: "dag_edge",
        data: undefined,
        animated: true,
        style: { stroke },
      };
    });
    if (!is_simple) {
      const condition_edges_raw = edges_filtered.filter(
        (e) =>
          e.target_handle === "__enable" ||
          e.source_id.startsWith("logic_") ||
          e.target_id.startsWith("logic_")
      );
      const condition_edges = condition_edges_raw.map((e, i) => {
        const is_conditional = e.target_handle === "__enable" || e.target_id.startsWith("logic_");
        const source_call = e.source_id === "dag_task" ? null : call_by_id.get(e.source_id);
        const stroke = source_call ? get_agent_color(source_call.agent_name).stroke : "rgb(113 113 122)";
        const enable_value = e.target_handle === "__enable" ? normalize_enable_value_single(call_by_id.get(e.target_id)?.inputs?.__enable) : null;
        const use_condition_edge = e.target_handle === "__enable" && enable_value != null;
        return {
          id: `e-cond-${e.source_id}-${e.source_handle}-${e.target_id}-${e.target_handle}-${i}`,
          source: e.source_id,
          target: e.target_id,
          sourceHandle: e.source_handle,
          targetHandle: e.target_handle,
          type: use_condition_edge ? "dag_condition_edge" : "dag_edge",
          data: use_condition_edge ? { target_call_id: e.target_id, enable_value } : undefined,
          animated: !is_conditional,
          style: is_conditional
            ? { stroke: "rgb(113 113 122)", strokeDasharray: "2 3", strokeWidth: 1.5 }
            : { stroke },
        };
      });
      edges = [...edges, ...condition_edges];
    }
  } else {
    edges = edges_filtered.map((e, i) => {
      const is_conditional = e.target_handle === "__enable" || e.target_id.startsWith("logic_");
      const source_call = e.source_id === "dag_task" ? null : call_by_id.get(e.source_id);
      const stroke = source_call ? get_agent_color(source_call.agent_name).stroke : "rgb(113 113 122)";
      const enable_value = e.target_handle === "__enable" ? normalize_enable_value_single(call_by_id.get(e.target_id)?.inputs?.__enable) : null;
      const use_condition_edge = e.target_handle === "__enable" && enable_value != null;
      return {
        id: `e-${e.source_id}-${e.source_handle}-${e.target_id}-${e.target_handle}-${i}`,
        source: e.source_id,
        target: e.target_id,
        sourceHandle: e.source_handle,
        targetHandle: e.target_handle,
        type: use_condition_edge ? "dag_condition_edge" : "dag_edge",
        data: use_condition_edge ? { target_call_id: e.target_id, enable_value } : undefined,
        animated: !is_conditional,
        style: is_conditional
          ? { stroke: "rgb(113 113 122)", strokeDasharray: "2 3", strokeWidth: 1.5 }
          : { stroke },
      };
    });
  }
  const task_edge = edges_filtered.find((e) => e.source_id === "dag_task");
  const task_node: Node | null =
    task_edge && initial_task != null && !guardrail_ids.has(task_edge.target_id)
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
  const constant_descriptors_raw = get_constant_dag_descriptors(agent_calls);
  const constant_descriptors = is_simple
    ? constant_descriptors_raw.filter((d) => !guardrail_ids.has(d.target_call_id))
    : constant_descriptors_raw;
  const constant_value_key = (value: unknown) => JSON.stringify(value);
  const value_key_to_node_id = new Map<string, string>();
  const unique_constant_entries: { value_key: string; value: unknown; first: ConstantDagDescriptor }[] = [];
  for (const d of constant_descriptors) {
    const key = constant_value_key(d.value);
    if (!value_key_to_node_id.has(key)) {
      const node_id = `const_val_${value_key_to_node_id.size}`;
      value_key_to_node_id.set(key, node_id);
      unique_constant_entries.push({ value_key: key, value: d.value, first: d });
    }
  }
  const target_call_to_constant_indices =
    is_simplified_deps
      ? (() => {
          const m = new Map<string, number>();
          for (const entry of unique_constant_entries) {
            const id = entry.first.target_call_id;
            m.set(id, (m.get(id) ?? 0) + 1);
          }
          return m;
        })()
      : null;
  const target_call_constant_index = is_simplified_deps ? new Map<string, number>() : null;
  const constant_nodes: Node[] = unique_constant_entries.map((entry) => {
    const first = entry.first;
    const target_handle = is_simplified_deps ? "data" : first.target_handle;
    let constant_index_in_group: number | undefined;
    let constant_group_size: number | undefined;
    if (is_simplified_deps && target_call_constant_index) {
      const idx = target_call_constant_index.get(first.target_call_id) ?? 0;
      target_call_constant_index.set(first.target_call_id, idx + 1);
      constant_index_in_group = idx;
      constant_group_size = target_call_to_constant_indices!.get(first.target_call_id) ?? 1;
    }
    return {
      id: value_key_to_node_id.get(entry.value_key)!,
      type: "dag_constant",
      position: { x: 0, y: 0 },
      data: {
        value: entry.value,
        target_call_id: first.target_call_id,
        target_handle,
        ...(constant_index_in_group != null && constant_group_size != null
          ? { constant_index_in_group, constant_group_size }
          : {}),
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      width: DAG_CONSTANT_NODE_WIDTH,
      height: DAG_CONSTANT_NODE_HEIGHT,
      selected: false,
    };
  });
  const constant_edges: Edge[] = constant_descriptors.flatMap((d, i) => {
    const node_id = value_key_to_node_id.get(constant_value_key(d.value))!;
    const target_handle = is_simplified_deps ? "data" : d.target_handle;
    return [
      {
        id: `e-const-${node_id}-${d.target_call_id}-${target_handle}-${i}`,
        source: node_id,
        target: d.target_call_id,
        sourceHandle: "value",
        targetHandle: target_handle,
        type: "dag_edge",
        animated: true,
        style: { stroke: "rgb(113 113 122)" },
      },
    ];
  });
  const logic_node_ids = new Set<string>();
  if (!is_simple) {
    edges_filtered.forEach((e) => {
      if (e.source_id.startsWith("logic_")) logic_node_ids.add(e.source_id);
      if (e.target_id.startsWith("logic_")) logic_node_ids.add(e.target_id);
    });
  }
  const logic_nodes: Node[] = [];
  logic_node_ids.forEach((logic_id) => {
    const match = /^logic_(.+)_enable$/.exec(logic_id);
    const call_id = match?.[1];
    const call = call_id ? call_by_id.get(call_id) : undefined;
    const enable_val = call?.inputs?.__enable;
    if (
      enable_val != null &&
      typeof enable_val === "object" &&
      "op" in enable_val &&
      "operands" in enable_val &&
      Array.isArray((enable_val as { operands: unknown[] }).operands)
    ) {
      const op = (enable_val as { op: "and" | "or" }).op;
      const operands = (enable_val as { operands: unknown[] }).operands;
      const input_handles = operands.map((_, i) => `in${i}`);
      const height = get_dag_logic_node_height(input_handles.length);
      logic_nodes.push({
        id: logic_id,
        type: "dag_logic",
        position: { x: 0, y: 0 },
        data: { op, input_handles, target_call_id: call_id ?? "", enable_value: enable_val },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        width: DAG_LOGIC_NODE_WIDTH,
        height,
        selected: false,
      });
    }
  });
  const final_response_id = "dag_final_response";
  let final_response_node: Node | null = null;
  let final_response_edge: Edge | null = null;
  if (final_response_ref) {
    const parsed = parse_final_response_ref(final_response_ref);
    if (parsed) {
      const source_call_id = agent_calls.some((c) => c.id === `${run_id}-${parsed.ref_call_id}`)
        ? `${run_id}-${parsed.ref_call_id}`
        : agent_calls.find((c) => c.id.endsWith(`-${parsed.ref_call_id}`))?.id;
      if (source_call_id && source_output_handles_by_call_id[source_call_id]?.includes(parsed.output_handle) && (!is_simple || !guardrail_ids.has(source_call_id))) {
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
          draggable: true,
        };
        const source_call = call_by_id.get(source_call_id);
        const stroke = source_call ? get_agent_color(source_call.agent_name).stroke : "rgb(34 211 238)";
        final_response_edge = {
          id: `e-final-${source_call_id}-${parsed.output_handle}`,
          source: source_call_id,
          target: final_response_id,
          sourceHandle: is_simplified_deps ? "data" : parsed.output_handle,
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
    ...logic_nodes,
    ...(final_response_node ? [final_response_node] : []),
  ];
  const all_edges = add_step_edge_offsets([
    ...edges,
    ...constant_edges,
    ...(final_response_edge ? [final_response_edge] : []),
  ]);

  if (all_nodes.length === 0) return { nodes: all_nodes, edges: all_edges };

  const use_saved =
    saved_positions != null &&
    constant_nodes.length === 0 &&
    logic_nodes.length === 0 &&
    !task_node &&
    (!final_response_node || saved_positions[final_response_id] != null) &&
    nodes.every((n) => saved_positions[n.id] != null);

  if (use_saved) {
    const nodes_with_positions = nodes.map((node) => ({
      ...node,
      position: saved_positions![node.id],
    }));
    const logic_with_positions = logic_nodes.map((node) => ({
      ...node,
      position: saved_positions?.[node.id] ?? node.position,
    }));
    const final_response_with_position =
      final_response_node != null && saved_positions?.[final_response_id] != null
        ? { ...final_response_node, position: saved_positions![final_response_id] }
        : final_response_node;
    return {
      nodes: [
        ...constant_nodes,
        ...(task_node ? [task_node] : []),
        ...nodes_with_positions,
        ...logic_with_positions,
        ...(final_response_with_position ? [final_response_with_position] : []),
      ],
      edges: all_edges,
    };
  }
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    align: "UL",
    ranksep: 110,
    nodesep: 300,
    edgesep: 24,
  });

  const layout_nodes = [...nodes, ...logic_nodes];
  layout_nodes.forEach((n) => {
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
      const data = node.data as {
        value: unknown;
        target_call_id?: string;
        target_handle?: string;
        constant_index_in_group?: number;
        constant_group_size?: number;
      };
      if (data.target_call_id != null && data.target_handle != null) {
        const target = agent_positions.get(data.target_call_id);
        if (!target) return { ...node, position: { x: 0, y: 0 } };
        const handle_index = target.input_handles.indexOf(data.target_handle);
        const handle_center_y = target.y + get_input_handle_center_y_offset(target.height, handle_index >= 0 ? handle_index : 0, target.input_handles.length);
        const base_x = target.x - DAG_CONSTANT_NODE_WIDTH - CONSTANT_NODE_GAP;
        let y = handle_center_y - DAG_CONSTANT_NODE_HEIGHT / 2;
        if (data.constant_index_in_group != null && data.constant_group_size != null && data.constant_group_size > 1) {
          const stack_offset = (data.constant_index_in_group - (data.constant_group_size - 1) / 2) * (DAG_CONSTANT_NODE_HEIGHT + 4);
          y += stack_offset;
        }
        return {
          ...node,
          position: { x: base_x, y },
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
    if (node.type === "dag_logic") {
      const pos = g.node(node.id);
      const w = (node.width as number) ?? DAG_LOGIC_NODE_WIDTH;
      const h = (node.height as number) ?? 40;
      if (pos != null) {
        return {
          ...node,
          position: { x: pos.x - w / 2, y: pos.y - h / 2 },
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
  on_update_call,
  on_record_call_updates,
  on_record_positions_change,
  dag_tab_id,
  on_graph_undo,
  on_graph_redo,
  can_graph_undo,
  can_graph_redo,
}: {
  run: Run;
  selected_call_id: string | null;
  on_select_call: (call_id: string | null) => void;
  on_positions_change?: (run_id: string, positions: Record<string, { x: number; y: number }>) => void;
  on_reset_positions?: (run_id: string) => void;
  show_calls_panel?: boolean;
  on_toggle_calls_panel?: () => void;
  on_update_call?: (run_id: string, call_id: string, updates: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> }, opts?: { replace_inputs?: boolean }) => void;
  on_record_call_updates?: (run_id: string, updates: { call_id: string; prev_inputs: Record<string, unknown>; next_inputs: Record<string, unknown> }[]) => void;
  on_record_positions_change?: (run_id: string, prev: Record<string, { x: number; y: number }>, next: Record<string, { x: number; y: number }>, tab_id?: string) => void;
  dag_tab_id?: string;
  on_graph_undo?: () => void;
  on_graph_redo?: () => void;
  can_graph_undo?: boolean;
  can_graph_redo?: boolean;
}) {
  const handle_enable_operator_change = useCallback(
    (call_id: string, new_value: EnableValue) => {
      if (on_update_call == null) return;
      const call = run.agent_calls.find((c) => c.id === call_id);
      if (call == null) return;
      const prev_inputs = { ...call.inputs };
      const next_inputs = { ...call.inputs, __enable: new_value };
      if (on_record_call_updates != null) {
        on_record_call_updates(run.id, [{ call_id, prev_inputs, next_inputs }]);
      }
      on_update_call(run.id, call_id, { inputs: next_inputs }, { replace_inputs: true });
    },
    [run.id, run.agent_calls, on_update_call, on_record_call_updates]
  );
const DAG_VIEW_STORAGE_KEYS = {
  edge_path_mode: "run_dag_view.edge_path_mode",
  dag_view_mode: "run_dag_view.dag_view_mode",
  data_deps_mode: "run_dag_view.data_deps_mode",
} as const;

function get_stored_edge_path_mode(): EdgePathMode {
  if (typeof window === "undefined") return "smoothstep";
  const v = localStorage.getItem(DAG_VIEW_STORAGE_KEYS.edge_path_mode);
  if (v === "smoothstep" || v === "curved" || v === "straight") return v;
  return "smoothstep";
}

function get_stored_dag_view_mode(): DagViewMode {
  if (typeof window === "undefined") return "simple";
  const v = localStorage.getItem(DAG_VIEW_STORAGE_KEYS.dag_view_mode);
  if (v === "simple" || v === "guardrail") return v;
  return "simple";
}

function get_stored_data_deps_mode(): DataDepsMode {
  if (typeof window === "undefined") return "detailed";
  const v = localStorage.getItem(DAG_VIEW_STORAGE_KEYS.data_deps_mode);
  if (v === "simplified" || v === "detailed") return v;
  return "detailed";
}

  const [edge_path_mode, set_edge_path_mode] = useState<EdgePathMode>(get_stored_edge_path_mode);
  const [dag_view_mode, set_dag_view_mode] = useState<DagViewMode>(get_stored_dag_view_mode);
  const [data_deps_mode, set_data_deps_mode] = useState<DataDepsMode>(get_stored_data_deps_mode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(DAG_VIEW_STORAGE_KEYS.edge_path_mode, edge_path_mode);
    } catch {}
  }, [edge_path_mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(DAG_VIEW_STORAGE_KEYS.dag_view_mode, dag_view_mode);
    } catch {}
  }, [dag_view_mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(DAG_VIEW_STORAGE_KEYS.data_deps_mode, data_deps_mode);
    } catch {}
  }, [data_deps_mode]);

  const { nodes: initial_nodes, edges: initial_edges } = useMemo(
    () =>
      get_layouted_nodes_and_edges(
        run.id,
        run.agent_calls,
        selected_call_id,
        run.dag_node_positions,
        run.final_response_ref,
        run.initial_task,
        dag_view_mode,
        data_deps_mode
      ),
    [run.id, run.agent_calls, run.dag_node_positions, run.final_response_ref, run.initial_task, selected_call_id, dag_view_mode, data_deps_mode]
  );
  const [nodes, set_nodes, on_nodes_change] = useNodesState(initial_nodes);
  const [edges, set_edges, on_edges_change] = useEdgesState(initial_edges);

  type CallUpdate = { call_id: string; prev_inputs: Record<string, unknown>; next_inputs: Record<string, unknown> };

  const get_edge_removal_updates = useCallback(
    (edge: Edge): CallUpdate | null => {
      const { target, targetHandle } = edge;
      if (target == null || targetHandle == null || target === "dag_final_response") return null;
      if (typeof target === "string" && target.startsWith("logic_")) {
        const match = /^logic_(.+)_enable$/.exec(target);
        const target_call_id = match?.[1];
        if (target_call_id == null) return null;
        const target_call = run.agent_calls.find((c) => c.id === target_call_id);
        if (target_call == null) return null;
        const current = target_call.inputs?.__enable;
        if (current == null || typeof current !== "object" || !("op" in current) || !("operands" in current) || !Array.isArray((current as { operands: unknown[] }).operands)) return null;
        const op = (current as { op: "and" | "or" }).op;
        const operands = (current as { operands: { ref: string; negate?: boolean }[] }).operands;
        const idx = parseInt((targetHandle as string).replace(/^in/, ""), 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= operands.length) return null;
        const new_operands = operands.filter((_, i) => i !== idx);
        let new_enable: EnableValue | undefined;
        if (new_operands.length === 0) new_enable = undefined;
        else if (new_operands.length === 1) new_enable = { ref: new_operands[0].ref, ...(new_operands[0].negate === true ? { negate: true } : {}) };
        else new_enable = { op, operands: new_operands };
        const prev_inputs = { ...target_call.inputs };
        const next_inputs = { ...target_call.inputs };
        if (new_enable === undefined) delete next_inputs.__enable;
        else next_inputs.__enable = new_enable;
        return { call_id: target_call_id, prev_inputs, next_inputs };
      }
      const target_call = run.agent_calls.find((c) => c.id === target);
      if (target_call == null) return null;
      const prev_inputs = { ...target_call.inputs };
      const next_inputs = { ...target_call.inputs };
      if (targetHandle === "__enable") delete next_inputs.__enable;
      else delete next_inputs[targetHandle as string];
      return { call_id: target, prev_inputs, next_inputs };
    },
    [run.agent_calls]
  );

  const apply_edge_removal_to_run = useCallback(
    (edge: Edge) => {
      if (on_update_call == null) return;
      const update = get_edge_removal_updates(edge);
      if (update == null) return;
      on_update_call(run.id, update.call_id, { inputs: update.next_inputs }, { replace_inputs: true });
    },
    [run.id, on_update_call, get_edge_removal_updates]
  );

  const handle_edges_change = useCallback(
    (changes: Parameters<typeof on_edges_change>[0]) => {
      const filtered: Parameters<typeof on_edges_change>[0] = [];
      const removal_updates: CallUpdate[] = [];
      changes.forEach((c) => {
        if (c.type === "remove" && "id" in c) {
          const edge = edges.find((e) => e.id === c.id);
          if (edge?.target === "dag_final_response") return;
          if (edge) {
            const u = get_edge_removal_updates(edge);
            if (u != null) removal_updates.push(u);
          }
        }
        filtered.push(c);
      });
      if (removal_updates.length > 0 && on_record_call_updates != null) {
        on_record_call_updates(run.id, removal_updates);
      }
      removal_updates.forEach((u) => {
        if (on_update_call != null) on_update_call(run.id, u.call_id, { inputs: u.next_inputs }, { replace_inputs: true });
      });
      on_edges_change(filtered);
    },
    [edges, run.id, on_edges_change, get_edge_removal_updates, on_record_call_updates, on_update_call]
  );

  const selected_edge_ids = useMemo(() => new Set(edges.filter((e) => e.selected).map((e) => e.id)), [edges]);
  const has_selected_edges = selected_edge_ids.size > 0;

  const handle_delete_selected_edges = useCallback(() => {
    if (on_update_call == null || !has_selected_edges) return;
    const removal_updates: CallUpdate[] = [];
    edges.forEach((edge) => {
      if (edge.selected && edge.target !== "dag_final_response") {
        const u = get_edge_removal_updates(edge);
        if (u != null) removal_updates.push(u);
      }
    });
    if (removal_updates.length > 0 && on_record_call_updates != null) {
      on_record_call_updates(run.id, removal_updates);
    }
    removal_updates.forEach((u) => {
      on_update_call(run.id, u.call_id, { inputs: u.next_inputs }, { replace_inputs: true });
    });
    set_edges(edges.filter((e) => !e.selected || e.target === "dag_final_response"));
  }, [edges, has_selected_edges, run.id, on_update_call, on_record_call_updates, set_edges, get_edge_removal_updates]);

  const handle_delete_edge_by_id = useCallback(
    (edge_id: string) => {
      if (on_update_call == null) return;
      const edge = edges.find((e) => e.id === edge_id);
      if (edge == null || edge.target === "dag_final_response") return;
      const update = get_edge_removal_updates(edge);
      if (update == null) return;
      if (on_record_call_updates != null) {
        on_record_call_updates(run.id, [update]);
      }
      on_update_call(run.id, update.call_id, { inputs: update.next_inputs }, { replace_inputs: true });
      set_edges(edges.filter((e) => e.id !== edge_id));
    },
    [edges, run.id, on_update_call, on_record_call_updates, set_edges, get_edge_removal_updates]
  );

  useEffect(() => {
    set_nodes(initial_nodes);
    set_edges((prev) => {
      const from_run = initial_edges.map((e) => ({
        ...e,
        deletable: on_update_call != null && e.target !== "dag_final_response",
        data: { ...e.data, deletable: on_update_call != null && e.target !== "dag_final_response" },
      }));
      const run_key_set = new Set(from_run.map((e) => `${e.source}-${e.sourceHandle}-${e.target}-${e.targetHandle}`));
      const pending = prev.filter(
        (e) => e.id.startsWith("pending-") && !run_key_set.has(`${e.source}-${e.sourceHandle}-${e.target}-${e.targetHandle}`)
      );
      return [...from_run, ...pending];
    });
  }, [initial_nodes, initial_edges, on_update_call, set_nodes, set_edges]);

  const handle_node_click = useCallback(
    (e: React.MouseEvent, node: { id: string; type?: string; data?: Record<string, unknown> }) => {
      if (connection_just_completed_ref.current) return;
      if ((e.target as HTMLElement)?.closest?.(".react-flow__handle")) return;
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
      const next_positions: Record<string, { x: number; y: number }> = {};
      nodes.forEach((n) => {
        next_positions[n.id] = n.id === dragged_node.id ? dragged_node.position : n.position;
      });
      const prev = drag_start_positions_ref.current;
      if (prev != null && on_record_positions_change != null) {
        on_record_positions_change(run.id, prev, next_positions, dag_tab_id);
      }
      on_positions_change(run.id, next_positions);
      drag_start_positions_ref.current = null;
    },
    [run.id, on_positions_change, on_record_positions_change, dag_tab_id, nodes]
  );

  const drag_start_positions_ref = useRef<Record<string, { x: number; y: number }> | null>(null);
  const connection_just_completed_ref = useRef(false);

  const handle_node_drag_start = useCallback(
    (_: React.MouseEvent, _node: Node) => {
      drag_start_positions_ref.current = Object.fromEntries(nodes.map((n) => [n.id, n.position]));
    },
    [nodes]
  );

  const is_valid_connection = useCallback(
    (connection: Connection) => {
      if (connection.source == null || connection.target == null) return false;
      const normalized_target_handle =
        connection.targetHandle === "__enable_node" ? "__enable" : connection.targetHandle;
      if (connection.sourceHandle == null || normalized_target_handle == null) return false;
      const source_node = nodes.find((n) => n.id === connection.source);
      const target_node = nodes.find((n) => n.id === connection.target);
      if (source_node == null || target_node == null) return false;
      const is_same_node = connection.source === connection.target;
      if (is_same_node) {
        if (normalized_target_handle !== "__enable") return false;
        if (source_node.type !== "dag" || target_node.type !== "dag") return false;
        const sh = connection.sourceHandle as string;
        if (sh == null || sh.startsWith("input:")) return false;
        return true;
      }

      const is_source_output = (): boolean => {
        if (source_node.type === "dag") {
          const sh = connection.sourceHandle as string;
          return sh != null && !sh.startsWith("input:");
        }
        if (source_node.type === "dag_constant") return connection.sourceHandle === "value";
        if (source_node.type === "dag_logic") return connection.sourceHandle === "out";
        return false;
      };

      const is_target_input = (): boolean => {
        if (target_node.type === "dag") {
          const data = target_node.data as { input_handles?: string[]; show_enable_port?: boolean };
          const input_handles = data.input_handles ?? [];
          if (normalized_target_handle === "__enable" && data.show_enable_port !== false) return true;
          return input_handles.includes(normalized_target_handle as string);
        }
        if (target_node.type === "dag_logic") {
          const data = target_node.data as { input_handles?: string[] };
          return (data.input_handles ?? []).includes(connection.targetHandle as string);
        }
        return false;
      };

      if (!is_source_output() || !is_target_input()) return false;
      if (source_node.type === "dag_constant" && normalized_target_handle === "__enable") return false;
      if (source_node.type === "dag_constant" && target_node.type === "dag_logic") return false;
      return true;
    },
    [nodes]
  );

  const handle_connect = useCallback(
    (connection: Connection) => {
      const normalized_target_handle =
        connection.targetHandle === "__enable_node" ? "__enable" : connection.targetHandle;
      if (on_update_call == null || connection.source == null || connection.target == null || connection.sourceHandle == null || normalized_target_handle == null) return;
      const source_id = connection.source;
      const target_id = connection.target;
      const source_node = nodes.find((n) => n.id === source_id);
      const target_node = nodes.find((n) => n.id === target_id);
      if (source_node == null || target_node == null) return;

      const add_optimistic_edge = () => {
        const is_conditional =
          normalized_target_handle === "__enable" || (typeof target_id === "string" && target_id.startsWith("logic_"));
        const source_call = run.agent_calls.find((c) => c.id === source_id);
        const stroke = source_call ? get_agent_color(source_call.agent_name).stroke : "rgb(113 113 122)";
        const use_condition_edge = normalized_target_handle === "__enable" && target_node.type === "dag";
        const enable_value: EnableValue = { ref: `${source_id}.outputs.${connection.sourceHandle}` };
        const optimistic: Edge = {
          id: `pending-${source_id}-${connection.sourceHandle}-${target_id}-${normalized_target_handle}`,
          source: source_id,
          target: target_id,
          sourceHandle: connection.sourceHandle,
          targetHandle: normalized_target_handle,
          type: use_condition_edge ? "dag_condition_edge" : "dag_edge",
          data: use_condition_edge ? { target_call_id: target_id, enable_value } : undefined,
          animated: !is_conditional,
          style: is_conditional
            ? { stroke: "rgb(113 113 122)", strokeDasharray: "2 3", strokeWidth: 1.5 }
            : { stroke },
        };
        set_edges((prev) => [...prev.filter((e) => e.id !== optimistic.id), optimistic]);
        connection_just_completed_ref.current = true;
        setTimeout(() => {
          connection_just_completed_ref.current = false;
        }, 300);
      };

      if (target_node.type === "dag") {
        const target_call = run.agent_calls.find((c) => c.id === target_id);
        if (target_call == null) return;
        const prev_inputs = { ...target_call.inputs };
        const inputs = { ...target_call.inputs };

        if (normalized_target_handle === "__enable") {
          if (source_node.type === "dag") {
            inputs.__enable = { ref: `${connection.source}.outputs.${connection.sourceHandle}` };
            if (on_record_call_updates != null) on_record_call_updates(run.id, [{ call_id: connection.target, prev_inputs, next_inputs: { ...inputs } }]);
            on_update_call(run.id, target_id, { inputs }, { replace_inputs: true });
            add_optimistic_edge();
          }
          return;
        }

        if (source_node.type === "dag_constant") {
          const value = (source_node.data as { value?: unknown }).value;
          inputs[normalized_target_handle] = value;
          if (on_record_call_updates != null) on_record_call_updates(run.id, [{ call_id: target_id, prev_inputs, next_inputs: { ...inputs } }]);
          on_update_call(run.id, target_id, { inputs }, { replace_inputs: true });
          add_optimistic_edge();
          return;
        }

        if (source_node.type === "dag") {
          inputs[normalized_target_handle] = { ref: `${connection.source}.outputs.${connection.sourceHandle}` };
          if (on_record_call_updates != null) on_record_call_updates(run.id, [{ call_id: target_id, prev_inputs, next_inputs: { ...inputs } }]);
          on_update_call(run.id, target_id, { inputs }, { replace_inputs: true });
          add_optimistic_edge();
        }
        return;
      }

      if (target_node.type === "dag_logic") {
        const data = target_node.data as { target_call_id?: string; enable_value?: EnableValue; input_handles?: string[] };
        const target_call_id = data.target_call_id ?? "";
        const target_call = run.agent_calls.find((c) => c.id === target_call_id);
        if (target_call == null || source_node.type !== "dag") return;
        const operand_index = parseInt((connection.targetHandle as string).replace(/^in/, ""), 10);
        if (Number.isNaN(operand_index) || operand_index < 0) return;

        const new_ref: EnableValue = { ref: `${connection.source}.outputs.${connection.sourceHandle}` };
        const current = target_call.inputs?.__enable;
        let new_enable: EnableValue;

        if (current != null && typeof current === "object" && "op" in current && "operands" in current && Array.isArray((current as { operands: unknown[] }).operands)) {
          const op = (current as { op: "and" | "or" }).op;
          const existing = (current as { operands: { ref: string; negate?: boolean }[] }).operands;
          const operands = existing.map((o) => ({ ref: o.ref, ...(o.negate === true ? { negate: true } : {}) }));
          while (operands.length <= operand_index) operands.push({ ref: (operands[0]?.ref ?? (new_ref as { ref: string }).ref) });
          operands[operand_index] = { ref: (new_ref as { ref: string }).ref };
          new_enable = { op, operands };
        } else if (current != null && typeof current === "object" && "ref" in current) {
          const prev = current as { ref: string; negate?: boolean };
          const operands: { ref: string; negate?: boolean }[] = new Array(operand_index + 1).fill(null).map((_, i) => (i === operand_index ? { ref: (new_ref as { ref: string }).ref } : { ref: prev.ref, ...(prev.negate === true ? { negate: true } : {}) }));
          new_enable = { op: "and", operands };
        } else {
          new_enable = operand_index === 0 ? new_ref : { op: "and", operands: new Array(operand_index + 1).fill((new_ref as { ref: string }).ref).map((ref) => ({ ref })) };
        }
        const prev_inputs = { ...target_call.inputs };
        const next_inputs = { ...target_call.inputs, __enable: new_enable };
        if (on_record_call_updates != null) on_record_call_updates(run.id, [{ call_id: target_call_id, prev_inputs, next_inputs }]);
        on_update_call(run.id, target_call_id, { inputs: next_inputs }, { replace_inputs: true });
        add_optimistic_edge();
      }
    },
    [run.id, run.agent_calls, on_update_call, on_record_call_updates, nodes, set_edges]
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

  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" && e.shiftKey && on_graph_redo != null && can_graph_redo) {
          e.preventDefault();
          on_graph_redo();
        } else if (e.key === "z" && !e.shiftKey && on_graph_undo != null && can_graph_undo) {
          e.preventDefault();
          on_graph_undo();
        } else if (e.key === "y" && on_graph_redo != null && can_graph_redo) {
          e.preventDefault();
          on_graph_redo();
        }
      }
    };
    window.addEventListener("keydown", on_key);
    return () => window.removeEventListener("keydown", on_key);
  }, [on_graph_undo, on_graph_redo, can_graph_undo, can_graph_redo]);

  const handle_node_label_click = useCallback(
    (payload: NodeLabelClickPayload) => {
      if (connection_just_completed_ref.current) return;
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
    <ConditionEdgeOperatorProvider value={handle_enable_operator_change}>
    <EdgeDeleteProvider value={on_update_call != null ? handle_delete_edge_by_id : null}>
    <div className="relative h-full min-h-[100px] w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 overflow-hidden flex flex-col">
      <div className="shrink-0 flex items-center justify-end gap-2 px-2 py-1.5 border-b border-zinc-700/50">
        <div className="flex flex-1" />
        <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-zinc-600 overflow-hidden" role="group" aria-label="DAG view">
          {(["simple", "guardrail"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set_dag_view_mode(mode)}
              className={`px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:ring-inset ${
                dag_view_mode === mode
                  ? "bg-zinc-600 text-zinc-100"
                  : "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
              }`}
            >
              {mode === "simple" ? "Simple" : "Guardrail"}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-zinc-600 overflow-hidden" role="group" aria-label="Data dependencies">
          {(["simplified", "detailed"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set_data_deps_mode(mode)}
              className={`px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:ring-inset ${
                data_deps_mode === mode
                  ? "bg-zinc-600 text-zinc-100"
                  : "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
              }`}
              title={mode === "simplified" ? "One edge per node pair, single port per node" : "Show field-to-field connections"}
            >
              {mode === "simplified" ? "Data flow" : "Fields"}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-zinc-600 overflow-hidden" role="group" aria-label="Edge style">
          {(["smoothstep", "curved", "straight"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => set_edge_path_mode(mode)}
              title={mode === "smoothstep" ? "Step" : mode === "curved" ? "Curved" : "Straight"}
              className={`p-2 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:ring-inset ${
                edge_path_mode === mode
                  ? "bg-zinc-600 text-zinc-100"
                  : "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
              }`}
            >
              {mode === "smoothstep" ? (
                <Workflow className="h-3.5 w-3.5" />
              ) : mode === "curved" ? (
                <Spline className="h-3.5 w-3.5" />
              ) : (
                <Minus className="h-3.5 w-3.5" />
              )}
            </button>
          ))}
        </div>
        {(on_graph_undo != null || on_graph_redo != null) && (
          <div className="flex rounded-md border border-zinc-600 overflow-hidden" role="group" aria-label="Undo redo">
            {on_graph_undo != null && (
              <button
                type="button"
                onClick={on_graph_undo}
                disabled={!can_graph_undo}
                className="flex items-center gap-1 rounded-l-md px-2 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-40 disabled:pointer-events-none"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>
            )}
            {on_graph_redo != null && (
              <button
                type="button"
                onClick={on_graph_redo}
                disabled={!can_graph_redo}
                className="flex items-center gap-1 rounded-r-md border-l border-zinc-600 px-2 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-40 disabled:pointer-events-none"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="h-3.5 w-3.5" />
                Redo
              </button>
            )}
          </div>
        )}
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
        {has_selected_edges && on_update_call != null && (
          <button
            type="button"
            onClick={handle_delete_selected_edges}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/20 focus:outline-none focus:ring-1 focus:ring-red-500/50"
            title="Delete selected edge(s)"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete edge{selected_edge_ids.size > 1 ? "s" : ""}
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
        onEdgesChange={handle_edges_change}
        onNodeClick={handle_node_click}
        onNodeDragStart={handle_node_drag_start}
        onNodeDragStop={handle_node_drag_stop}
        onPaneClick={handle_pane_click}
        nodeTypes={node_types}
        edgeTypes={edge_types}
        connectionMode={ConnectionMode.Strict}
        connectionRadius={12}
        connectionLineType={connection_line_type}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={true}
        nodesConnectable={on_update_call != null}
        onConnect={handle_connect}
        isValidConnection={is_valid_connection}
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
    </EdgeDeleteProvider>
    </ConditionEdgeOperatorProvider>
    </EdgePathModeProvider>
    </NodeLabelClickProvider>
  );
}
