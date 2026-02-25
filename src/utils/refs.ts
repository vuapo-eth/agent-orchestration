import type { OrchestratorPlan, OrchestratorCall } from "@/types/orchestrator";

export function get_ref_call_id(ref: string): string {
  const idx = ref.indexOf(".outputs");
  return idx >= 0 ? ref.slice(0, idx) : ref;
}

function is_ref_object(v: unknown): v is { ref: string } {
  return (
    v != null &&
    typeof v === "object" &&
    "ref" in v &&
    typeof (v as { ref: string }).ref === "string"
  );
}

function is_string_ref(v: unknown): v is string {
  return typeof v === "string" && /^[a-zA-Z0-9_-]+\.outputs(\.|$)/.test(v);
}

function get_ref_string(v: unknown): string | null {
  if (is_ref_object(v)) return v.ref;
  if (is_string_ref(v)) return v;
  return null;
}

export function has_refs(inputs: Record<string, unknown>): boolean {
  return Object.values(inputs).some((v) => get_ref_string(v) != null);
}

type CallWithOutputs = {
  id: string;
  state: string;
  outputs?: Record<string, unknown>;
};

export function resolve_refs_in_inputs(
  run_id: string,
  agent_calls: CallWithOutputs[],
  inputs: Record<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const finished_by_short_id = new Map<string, CallWithOutputs>();
  for (const c of agent_calls) {
    if (c.state === "finished" && c.outputs != null) {
      const short_id = c.id.startsWith(`${run_id}-`) ? c.id.slice(run_id.length + 1) : c.id;
      finished_by_short_id.set(short_id, c);
    }
  }
  for (const [key, val] of Object.entries(inputs)) {
    const ref = get_ref_string(val);
    if (ref != null) {
      const ref_call_id = get_ref_call_id(ref);
      const dep_call =
        finished_by_short_id.get(ref_call_id) ??
        agent_calls.find((c) => c.id === `${run_id}-${ref_call_id}` && c.state === "finished");
      if (!dep_call?.outputs) {
        resolved[key] = val;
        continue;
      }
      const path = ref.includes(".outputs.") ? ref.slice(ref.indexOf(".outputs.") + ".outputs.".length) : "";
      resolved[key] = path
        ? (path.split(".").reduce((o: unknown, p: string) => (o as Record<string, unknown>)?.[p], dep_call.outputs) ?? val)
        : dep_call.outputs;
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

export function all_refs_resolved(
  run_id: string,
  agent_calls: { id: string; state: string }[],
  inputs: Record<string, unknown>
): boolean {
  for (const v of Object.values(inputs)) {
    const ref = get_ref_string(v);
    if (ref != null) {
      const ref_call_id = get_ref_call_id(ref);
      const dep = agent_calls.find((c) => c.id === `${run_id}-${ref_call_id}` || c.id === ref_call_id);
      if (!dep || dep.state !== "finished") return false;
    }
  }
  return true;
}

function get_ref_call_ids_from_inputs(inputs: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const v of Object.values(inputs)) {
    const ref = get_ref_string(v);
    if (ref != null) {
      const id = get_ref_call_id(ref);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export function get_run_dag_edges(
  run_id: string,
  agent_calls: { id: string; agent_name: string; inputs: Record<string, unknown> }[]
): { source_id: string; source_handle: string; target_id: string; target_handle: string }[] {
  const id_set = new Set(agent_calls.map((c) => c.id));
  const edges: { source_id: string; source_handle: string; target_id: string; target_handle: string }[] = [];
  for (const call of agent_calls) {
    for (const [input_key, val] of Object.entries(call.inputs)) {
      const ref = get_ref_string(val);
      if (ref == null) continue;
      const ref_call_id = get_ref_call_id(ref);
      const source_id = id_set.has(ref_call_id) ? ref_call_id : `${run_id}-${ref_call_id}`;
      if (source_id === call.id || !id_set.has(source_id)) continue;
      const after_outputs = ref.includes(".outputs.")
        ? ref.slice(ref.indexOf(".outputs.") + ".outputs.".length)
        : "";
      const source_handle = after_outputs.split(".")[0] || "result";
      edges.push({ source_id, source_handle, target_id: call.id, target_handle: input_key });
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
  const suffix = ref.includes(".outputs")
    ? ref.slice(ref.indexOf(".outputs"))
    : "";
  return `${new_id}${suffix}`;
}

function rewrite_inputs_refs(
  inputs: Record<string, unknown>,
  id_map: Record<string, string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(inputs)) {
    const ref = get_ref_string(val);
    if (ref != null) {
      const new_ref = rewrite_ref(ref, id_map);
      if (is_ref_object(val)) {
        out[key] = { ref: new_ref };
      } else {
        out[key] = new_ref;
      }
    } else {
      out[key] = val;
    }
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
  return { calls };
}
