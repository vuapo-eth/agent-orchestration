import type { Run, RunTab, AgentCall } from "@/types/orchestration";
import type { OrchestratorPlan, OrchestratorCall } from "@/types/orchestrator";
import { get_ref_call_id, get_ref_string } from "@/utils/refs";

function is_ref_object(v: unknown): v is { ref: string } {
  return (
    v != null &&
    typeof v === "object" &&
    "ref" in (v as object) &&
    typeof (v as { ref: string }).ref === "string"
  );
}

export function get_short_call_id(run_id: string, full_id: string): string {
  if (full_id.startsWith(`${run_id}-`)) return full_id.slice(run_id.length + 1);
  if (full_id.includes("-") && /^call_\d+$/.test(full_id.split("-").pop() ?? "")) {
    return full_id.split("-").pop() ?? full_id;
  }
  return full_id;
}

export function get_effective_tabs(run: Run): RunTab[] {
  if (run.tabs != null && run.tabs.length > 0) return run.tabs;
  return [
    {
      id: `${run.id}-default`,
      label: "Original",
      agent_calls: run.agent_calls,
      final_response_ref: run.final_response_ref,
      final_output: run.final_output,
      final_error: run.final_error,
      dag_node_positions: run.dag_node_positions,
    },
  ];
}

export function get_selected_tab(run: Run): RunTab | null {
  const tabs = get_effective_tabs(run);
  if (tabs.length === 0) return null;
  if (run.selected_tab_id != null) {
    const t = tabs.find((tab) => tab.id === run.selected_tab_id);
    if (t != null) return t;
  }
  return tabs[0];
}

function ref_to_short(ref: string, full_to_short: Map<string, string>): string {
  const ref_call_id = get_ref_call_id(ref);
  const short_id = full_to_short.get(ref_call_id) ?? ref_call_id;
  if (ref.includes(".outputs")) return `${short_id}${ref.slice(ref.indexOf(".outputs"))}`;
  if (ref.includes(".inputs")) return `${short_id}${ref.slice(ref.indexOf(".inputs"))}`;
  if (ref.includes(".agent_definition")) return `${short_id}.agent_definition`;
  return ref;
}

function rewrite_value_to_short(
  val: unknown,
  full_to_short: Map<string, string>
): unknown {
  const ref = get_ref_string(val);
  if (ref != null) {
    const short_ref = ref_to_short(ref, full_to_short);
    if (is_ref_object(val)) {
      const out: Record<string, unknown> = { ref: short_ref };
      if ((val as Record<string, unknown>).negate === true) out.negate = true;
      return out;
    }
    return short_ref;
  }
  if (Array.isArray(val)) return val.map((item) => rewrite_value_to_short(item, full_to_short));
  if (val != null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = rewrite_value_to_short(v, full_to_short);
    }
    return out;
  }
  return val;
}

export function tab_to_plan_and_history(run_id: string, tab: RunTab): {
  plan: OrchestratorPlan;
  execution_history: Array<{
    call_id: string;
    agent_name: string;
    state: string;
    inputs?: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error_message?: string;
  }>;
} {
  const full_to_short = new Map<string, string>();
  for (const c of tab.agent_calls) {
    full_to_short.set(c.id, get_short_call_id(run_id, c.id));
  }
  const calls: OrchestratorCall[] = tab.agent_calls.map((c) => ({
    id: get_short_call_id(run_id, c.id),
    agent_name: c.agent_name,
    inputs: rewrite_value_to_short(c.inputs, full_to_short) as Record<string, unknown>,
  }));
  const plan: OrchestratorPlan = {
    calls,
    ...(tab.final_response_ref != null
      ? {
          final_response: ref_to_short(tab.final_response_ref, full_to_short),
        }
      : {}),
  };
  const execution_history = tab.agent_calls.map((c) => ({
    call_id: get_short_call_id(run_id, c.id),
    agent_name: c.agent_name,
    state: c.state,
    inputs: c.inputs,
    outputs: c.outputs,
    error_message: c.error_message,
  }));
  return { plan, execution_history };
}

export function run_tab_from_plan(
  run_id: string,
  plan: OrchestratorPlan,
  options?: { label?: string }
): RunTab {
  const tab_id = `${run_id}-tab-${Date.now()}`;
  const agent_calls: AgentCall[] = plan.calls.map((call) => ({
    id: `${run_id}-${call.id}`,
    agent_name: call.agent_name,
    state: "queued" as const,
    inputs: { ...(call.inputs ?? {}) },
  }));
  const has_refs = (inputs: Record<string, unknown>) =>
    Object.values(inputs).some(
      (v) =>
        v != null &&
        typeof v === "object" &&
        "ref" in (v as object)
    );
  const with_state = agent_calls.map((c) => ({
    ...c,
    state: has_refs(c.inputs) ? ("queued" as const) : ("ready" as const),
  }));
  return {
    id: tab_id,
    label: options?.label ?? "Regenerated",
    agent_calls: with_state,
    final_response_ref: plan.final_response,
  };
}
