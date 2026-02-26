import type { OrchestratorPlan, OrchestratorCall } from "@/types/orchestrator";
import type { AgentDoc } from "@/types/orchestrator";

const REF_STRING_PATTERN = /^[a-zA-Z0-9_-]+\.(outputs|inputs|agent_definition)(\..*|$)/;

function is_ref_object(v: unknown): v is { ref: string } {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!("ref" in o)) return false;
  const ref_val = o.ref;
  return typeof ref_val === "string" && ref_val.length > 0;
}

function looks_like_ref_value(v: unknown): boolean {
  if (is_ref_object(v)) return true;
  if (typeof v === "string" && REF_STRING_PATTERN.test(v)) return true;
  if (v != null && typeof v === "object" && "ref" in v) {
    const r = (v as Record<string, unknown>).ref;
    return typeof r === "string" && r.length > 0;
  }
  return false;
}

function is_string_ref(v: unknown): v is string {
  return typeof v === "string" && REF_STRING_PATTERN.test(v);
}

function get_ref_string(v: unknown): string | null {
  if (is_ref_object(v)) return v.ref;
  if (is_string_ref(v)) return v;
  return null;
}

export function has_refs(inputs: Record<string, unknown>): boolean {
  return has_refs_deep(inputs);
}

export function get_ref_call_id(ref: string): string {
  const m = /^(call_\d+)(\.|$)/.exec(ref);
  if (m) return m[1];
  const idx_out = ref.indexOf(".outputs");
  const idx_in = ref.indexOf(".inputs");
  const idx_def = ref.indexOf(".agent_definition");
  let idx = ref.length;
  if (idx_out >= 0) idx = Math.min(idx, idx_out);
  if (idx_in >= 0) idx = Math.min(idx, idx_in);
  if (idx_def >= 0) idx = Math.min(idx, idx_def);
  return idx < ref.length ? ref.slice(0, idx) : ref;
}

export function parse_final_response_ref(ref: string): { ref_call_id: string; output_handle: string } | null {
  if (!ref.includes(".outputs.")) return null;
  const ref_call_id = get_ref_call_id(ref);
  const output_handle = ref.slice(ref.indexOf(".outputs.") + ".outputs.".length).split(".")[0] ?? "outputs";
  return { ref_call_id, output_handle };
}

export function ref_needs_finished(ref: string): boolean {
  return ref.includes(".outputs");
}

function has_refs_deep(value: unknown): boolean {
  if (value == null) return false;
  if (looks_like_ref_value(value)) return true;
  if (Array.isArray(value)) return value.some(has_refs_deep);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(has_refs_deep);
  }
  return false;
}

type CallWithOutputs = {
  id: string;
  state: string;
  outputs?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  agent_name?: string;
};

export type ResolveRefsOptions = {
  agent_docs_by_name?: Record<string, AgentDoc>;
  initial_task?: string;
};

export function resolve_refs_in_inputs(
  run_id: string,
  agent_calls: CallWithOutputs[],
  inputs: Record<string, unknown>,
  options?: ResolveRefsOptions
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const finished_by_short_id = new Map<string, CallWithOutputs>();
  const call_by_short_id = new Map<string, CallWithOutputs>();
  const run_prefix =
    agent_calls[0]?.id?.includes("-") ?
      agent_calls[0].id.slice(0, agent_calls[0].id.lastIndexOf("-") + 1)
    : null;
  for (const c of agent_calls) {
    let short_id: string;
    if (c.id.startsWith(`${run_id}-`)) {
      short_id = c.id.slice(run_id.length + 1);
    } else if (run_prefix != null && c.id.startsWith(run_prefix)) {
      short_id = c.id.slice(run_prefix.length);
    } else if (c.id.includes("-")) {
      short_id = c.id.slice(c.id.lastIndexOf("-") + 1);
    } else {
      short_id = c.id;
    }
    call_by_short_id.set(short_id, c);
    call_by_short_id.set(c.id, c);
    if (c.state === "finished" && c.outputs != null) {
      finished_by_short_id.set(short_id, c);
      finished_by_short_id.set(c.id, c);
    }
  }
  for (const [key, val] of Object.entries(inputs)) {
    resolved[key] = resolve_value_deep(
      val,
      agent_calls,
      run_id,
      run_prefix,
      finished_by_short_id,
      call_by_short_id,
      options?.agent_docs_by_name ?? {},
      options?.initial_task
    );
  }
  return resolved;
}

function resolve_value_deep(
  val: unknown,
  agent_calls: CallWithOutputs[],
  run_id: string,
  run_prefix: string | null,
  finished_by_short_id: Map<string, CallWithOutputs>,
  call_by_short_id: Map<string, CallWithOutputs>,
  agent_docs_by_name: Record<string, AgentDoc>,
  initial_task?: string
): unknown {
  const ref = get_ref_string(val);
  if (ref != null) {
    if (ref === "task") return initial_task ?? val;
    const ref_call_id = get_ref_call_id(ref);
    const dep_call =
      call_by_short_id.get(ref_call_id) ??
      call_by_short_id.get(`${run_id}-${ref_call_id}`) ??
      (run_prefix != null ? call_by_short_id.get(run_prefix + ref_call_id) : undefined) ??
      agent_calls.find(
        (c) => c.id === ref_call_id || c.id === `${run_id}-${ref_call_id}` || c.id.endsWith(`-${ref_call_id}`)
      );
    if (!dep_call) return val;
    if (ref.includes(".agent_definition")) {
      const name = dep_call.agent_name;
      if (!name) return val;
      const doc = agent_docs_by_name[name];
      if (!doc) return val;
      return doc;
    }
    if (ref.includes(".inputs")) {
      const dep_inputs = dep_call.inputs ?? {};
      const resolved_inputs = resolve_refs_in_inputs(run_id, agent_calls, dep_inputs, {
        agent_docs_by_name: Object.keys(agent_docs_by_name).length > 0 ? agent_docs_by_name : undefined,
        initial_task,
      });
      const path = ref.includes(".inputs.")
        ? ref.slice(ref.indexOf(".inputs.") + ".inputs.".length)
        : "";
      return path
        ? (path.split(".").reduce((o: unknown, p: string) => (o as Record<string, unknown>)?.[p], resolved_inputs) ?? val)
        : resolved_inputs;
    }
    const finished =
      finished_by_short_id.get(ref_call_id) ??
      finished_by_short_id.get(`${run_id}-${ref_call_id}`) ??
      (run_prefix != null ? finished_by_short_id.get(run_prefix + ref_call_id) : undefined) ??
      (dep_call.state === "finished" && dep_call.outputs != null ? dep_call : undefined);
    if (!finished?.outputs) return val;
    const path = ref.includes(".outputs.") ? ref.slice(ref.indexOf(".outputs.") + ".outputs.".length) : "";
    return path
      ? (path.split(".").reduce((o: unknown, p: string) => (o as Record<string, unknown>)?.[p], finished.outputs) ?? val)
      : finished.outputs;
  }
  if (Array.isArray(val)) {
    return val.map((item) =>
      resolve_value_deep(
        item,
        agent_calls,
        run_id,
        run_prefix,
        finished_by_short_id,
        call_by_short_id,
        agent_docs_by_name,
        initial_task
      )
    );
  }
  if (val != null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = resolve_value_deep(
        v,
        agent_calls,
        run_id,
        run_prefix,
        finished_by_short_id,
        call_by_short_id,
        agent_docs_by_name,
        initial_task
      );
    }
    return out;
  }
  return val;
}

export function all_refs_resolved(
  run_id: string,
  agent_calls: { id: string; state: string; outputs?: unknown }[],
  inputs: Record<string, unknown>
): boolean {
  return get_unresolved_ref_call_ids(run_id, agent_calls, inputs).length === 0;
}

function find_finished_dep(
  run_id: string,
  agent_calls: { id: string; state: string; outputs?: unknown }[],
  ref_call_id: string
): { id: string; state: string; outputs?: unknown } | undefined {
  return agent_calls.find(
    (c) =>
      c.state === "finished" &&
      (c.id === ref_call_id || c.id === `${run_id}-${ref_call_id}` || c.id.endsWith(`-${ref_call_id}`))
  );
}

export function get_unresolved_ref_call_ids(
  run_id: string,
  agent_calls: { id: string; state: string; outputs?: unknown }[],
  inputs: Record<string, unknown>
): string[] {
  const dep_ids = get_output_ref_call_ids_from_inputs(inputs);
  const unresolved: string[] = [];
  for (const ref_call_id of dep_ids) {
    const dep = find_finished_dep(run_id, agent_calls, ref_call_id);
    if (!dep) unresolved.push(ref_call_id);
  }
  return [...new Set(unresolved)];
}

function get_ref_call_ids_from_inputs(inputs: Record<string, unknown>): string[] {
  const ids: string[] = [];
  function collect(val: unknown) {
    const ref = get_ref_string(val);
    if (ref != null) {
      if (ref === "task") return;
      const id = get_ref_call_id(ref);
      if (!ids.includes(id)) ids.push(id);
      return;
    }
    if (Array.isArray(val)) { for (const item of val) collect(item); return; }
    if (val != null && typeof val === "object") {
      for (const v of Object.values(val as Record<string, unknown>)) collect(v);
    }
  }
  for (const v of Object.values(inputs)) collect(v);
  return ids;
}

function get_output_ref_call_ids_from_inputs(inputs: Record<string, unknown>): string[] {
  const ids: string[] = [];
  function collect(val: unknown) {
    const ref = get_ref_string(val);
    if (ref != null && ref_needs_finished(ref)) {
      const id = get_ref_call_id(ref);
      if (!ids.includes(id)) ids.push(id);
      return;
    }
    if (Array.isArray(val)) { for (const item of val) collect(item); return; }
    if (val != null && typeof val === "object") {
      for (const v of Object.values(val as Record<string, unknown>)) collect(v);
    }
  }
  for (const v of Object.values(inputs)) collect(v);
  return ids;
}

export type ConstantDagDescriptor = {
  id: string;
  value: unknown;
  target_call_id: string;
  target_handle: string;
};

export function get_constant_dag_descriptors(
  agent_calls: { id: string; inputs?: Record<string, unknown> }[]
): ConstantDagDescriptor[] {
  const out: ConstantDagDescriptor[] = [];
  for (const call of agent_calls) {
    const inputs = call.inputs ?? {};
    for (const [input_key, val] of Object.entries(inputs)) {
      if (get_ref_string(val) != null) continue;
      if (has_refs_deep(val)) continue;
      out.push({
        id: `const_${call.id}_${input_key}`,
        value: val,
        target_call_id: call.id,
        target_handle: input_key,
      });
    }
  }
  return out;
}

export function get_run_dag_edges(
  run_id: string,
  agent_calls: { id: string; agent_name: string; inputs: Record<string, unknown> }[],
  options?: {
    source_output_handles_by_call_id?: Record<string, string[]>;
    source_input_handles_by_call_id?: Record<string, string[]>;
  }
): { source_id: string; source_handle: string; target_id: string; target_handle: string }[] {
  const id_set = new Set(agent_calls.map((c) => c.id));
  const edges: { source_id: string; source_handle: string; target_id: string; target_handle: string }[] = [];
  const seen = new Set<string>();
  const source_output_handles_by_call_id = options?.source_output_handles_by_call_id;
  const source_input_handles_by_call_id = options?.source_input_handles_by_call_id;

  function collect_refs(val: unknown): { ref_call_id: string; source_handle: string; is_input_ref: boolean }[] {
    const results: { ref_call_id: string; source_handle: string; is_input_ref: boolean }[] = [];
    const ref = get_ref_string(val);
    if (ref != null) {
      if (ref === "task") {
        results.push({ ref_call_id: "task", source_handle: "value", is_input_ref: false });
        return results;
      }
      const ref_call_id = get_ref_call_id(ref);
      let source_handle = "result";
      let is_input_ref = false;
      if (ref.includes(".outputs.")) {
        source_handle = ref.slice(ref.indexOf(".outputs.") + ".outputs.".length).split(".")[0] ?? "outputs";
      } else if (ref.includes(".outputs")) {
        source_handle = "outputs";
      } else if (ref.includes(".inputs.")) {
        source_handle = ref.slice(ref.indexOf(".inputs.") + ".inputs.".length).split(".")[0] ?? "inputs";
        is_input_ref = true;
      } else if (ref.includes(".inputs")) {
        source_handle = "inputs";
        is_input_ref = true;
      } else if (ref.includes(".agent_definition")) {
        source_handle = "agent_definition";
      }
      results.push({ ref_call_id, source_handle, is_input_ref });
      return results;
    }
    if (Array.isArray(val)) {
      for (const item of val) results.push(...collect_refs(item));
    } else if (val != null && typeof val === "object") {
      for (const v of Object.values(val as Record<string, unknown>)) results.push(...collect_refs(v));
    }
    return results;
  }

  for (const call of agent_calls) {
    const inputs = call.inputs ?? {};
    for (const [input_key, val] of Object.entries(inputs)) {
      for (const { ref_call_id, source_handle, is_input_ref } of collect_refs(val)) {
        if (ref_call_id === "task") {
          const source_id = "dag_task";
          const edge_key = `${source_id}:${source_handle}->${call.id}:${input_key}`;
          if (seen.has(edge_key)) continue;
          seen.add(edge_key);
          edges.push({ source_id, source_handle, target_id: call.id, target_handle: input_key });
          continue;
        }
        let source_id = id_set.has(ref_call_id) ? ref_call_id : `${run_id}-${ref_call_id}`;
        if (!id_set.has(source_id)) {
          const source_call = agent_calls.find(
            (c) => c.id === ref_call_id || c.id.endsWith(`-${ref_call_id}`)
          );
          if (source_call) source_id = source_call.id;
        }
        if (source_id === call.id || !id_set.has(source_id)) continue;
        const source_handles_to_emit =
          source_handle === "outputs" && source_output_handles_by_call_id?.[source_id]?.length
            ? source_output_handles_by_call_id[source_id]
            : source_handle === "inputs" && source_input_handles_by_call_id?.[source_id]?.length
              ? source_input_handles_by_call_id[source_id]
              : [source_handle];
        for (const sh of source_handles_to_emit) {
          const edge_key = `${source_id}:${sh}->${call.id}:${input_key}`;
          if (seen.has(edge_key)) continue;
          seen.add(edge_key);
          const handle_for_edge = is_input_ref ? `input:${sh}` : sh;
          edges.push({ source_id, source_handle: handle_for_edge, target_id: call.id, target_handle: input_key });
        }
      }
    }
  }
  return edges;
}

function topological_sort_calls(calls: OrchestratorCall[]): OrchestratorCall[] {
  const by_id = new Map(calls.map((c) => [c.id, c]));
  const result: OrchestratorCall[] = [];
  let remaining = [...calls];
  while (remaining.length > 0) {
    const ready = remaining.filter((c) => {
      const dep_ids = get_ref_call_ids_from_inputs(c.inputs ?? {});
      return dep_ids.every((dep_id) => !by_id.has(dep_id) || result.some((r) => r.id === dep_id));
    });
    if (ready.length === 0) {
      result.push(...remaining);
      break;
    }
    const picked = ready[0];
    result.push(picked);
    remaining = remaining.filter((c) => c.id !== picked.id);
  }
  return result;
}

function rewrite_ref(ref: string, id_map: Record<string, string>): string {
  const ref_call_id = get_ref_call_id(ref);
  const new_id = id_map[ref_call_id];
  if (new_id == null) return ref;
  if (ref.includes(".outputs")) return `${new_id}${ref.slice(ref.indexOf(".outputs"))}`;
  if (ref.includes(".inputs")) return `${new_id}${ref.slice(ref.indexOf(".inputs"))}`;
  if (ref.includes(".agent_definition")) return `${new_id}.agent_definition`;
  return ref;
}

function rewrite_value_refs(val: unknown, id_map: Record<string, string>): unknown {
  const ref = get_ref_string(val);
  if (ref != null) {
    const new_ref = rewrite_ref(ref, id_map);
    if (is_ref_object(val)) return { ref: new_ref };
    return new_ref;
  }
  if (Array.isArray(val)) return val.map((item) => rewrite_value_refs(item, id_map));
  if (val != null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = rewrite_value_refs(v, id_map);
    }
    return out;
  }
  return val;
}

function rewrite_inputs_refs(
  inputs: Record<string, unknown>,
  id_map: Record<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(inputs)) {
    out[key] = rewrite_value_refs(val, id_map);
  }
  return out;
}

export function normalize_plan_to_call_ids(plan: OrchestratorPlan): OrchestratorPlan {
  const sorted = topological_sort_calls(plan.calls);
  const id_map: Record<string, string> = {};
  sorted.forEach((call, i) => {
    id_map[call.id] = `call_${i + 1}`;
  });
  const calls = sorted.map((call, i) => ({
    ...call,
    id: `call_${i + 1}`,
    inputs: rewrite_inputs_refs(call.inputs ?? {}, id_map),
  }));
  return { calls, ...(plan.final_response != null ? { final_response: plan.final_response } : {}) };
}
