"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { Run, AgentCall } from "@/types/orchestration";
import type { OrchestratorPlan, OrchestratorCall } from "@/types/orchestrator";
import { has_refs, resolve_refs_in_inputs, all_refs_resolved, is_enabled, normalize_plan_to_call_ids, get_unresolved_ref_call_ids } from "@/utils/refs";
import { get_effective_tabs, get_selected_tab, tab_to_plan_and_history, run_tab_from_plan } from "@/utils/run_tabs";
import { Sidebar } from "@/components/orchestration/sidebar";
import { RunDetail } from "@/components/orchestration/run_detail";
import { AgentDetailView } from "@/components/orchestration/agent_detail_view";
import { DataSourcesView } from "@/components/data_sources/data_sources_view";
import { NewRunDialog } from "@/components/orchestration/new_run_dialog";
import { OrchestratorLoadingOverlay } from "@/components/orchestration/orchestrator_loading_overlay";
import { IMPLEMENTED_AGENT_DOCS, AGENT_DOCS_BY_NAME } from "@/lib/agents";
import { EXAMPLE_TABLES } from "@/data/example_tables";

const RUNS_STORAGE_KEY = "agent6h_runs";
const SIDEBAR_WIDTH_STORAGE_KEY = "agent6h_sidebar_width";
const GRAPH_HISTORY_STORAGE_KEY = "agent6h_graph_history";

const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;

function load_runs_from_storage(): { runs: Run[]; selected_run_id: string | null } {
  if (typeof window === "undefined") return { runs: [], selected_run_id: null };
  try {
    const raw = localStorage.getItem(RUNS_STORAGE_KEY);
    if (!raw) return { runs: [], selected_run_id: null };
    const parsed = JSON.parse(raw) as { runs: Run[]; selected_run_id: string | null };
    if (!Array.isArray(parsed.runs)) return { runs: [], selected_run_id: null };
    const valid_id =
      parsed.selected_run_id != null && parsed.runs.some((r) => r.id === parsed.selected_run_id)
        ? parsed.selected_run_id
        : parsed.runs[0]?.id ?? null;
    return { runs: parsed.runs, selected_run_id: valid_id };
  } catch {
    return { runs: [], selected_run_id: null };
  }
}

type GraphHistoryEntrySerialized =
  | {
      type: "positions";
      run_id: string;
      tab_id?: string;
      prev: Record<string, { x: number; y: number }>;
      next: Record<string, { x: number; y: number }>;
    }
  | {
      type: "call_updates";
      run_id: string;
      updates: { call_id: string; prev_inputs: Record<string, unknown>; next_inputs: Record<string, unknown> }[];
    };

function load_graph_history_from_storage(): {
  past: GraphHistoryEntrySerialized[];
  future: GraphHistoryEntrySerialized[];
} {
  if (typeof window === "undefined") return { past: [], future: [] };
  try {
    const raw = localStorage.getItem(GRAPH_HISTORY_STORAGE_KEY);
    if (!raw) return { past: [], future: [] };
    const parsed = JSON.parse(raw) as { past: GraphHistoryEntrySerialized[]; future: GraphHistoryEntrySerialized[] };
    const past = Array.isArray(parsed.past) ? parsed.past : [];
    const future = Array.isArray(parsed.future) ? parsed.future : [];
    return { past, future };
  } catch {
    return { past: [], future: [] };
  }
}

function run_from_orchestrator_plan(task: string, plan: OrchestratorPlan): Run {
  const run_id = `run-${Date.now()}`;
  const created_at = new Date().toISOString();
  const agent_calls = plan.calls.map((call: OrchestratorCall) => ({
    id: `${run_id}-${call.id}`,
    agent_name: call.agent_name,
    state: has_refs(call.inputs ?? {}) ? ("queued" as const) : ("ready" as const),
    inputs: { ...(call.inputs ?? {}) },
  }));
  return {
    id: run_id,
    created_at,
    initial_task: task,
    agent_calls,
    final_response_ref: plan.final_response ?? undefined,
  };
}

const AGENT_API: Record<string, string> = {
  "SQL query agent": "/api/agents/sql",
  "JS data processor": "/api/agents/js-process",
  "Human response generator": "/api/agents/response",
  "Execution validator": "/api/agents/validator",
};

function mark_ready_where_possible(run_id: string, agent_calls: AgentCall[]): AgentCall[] {
  return agent_calls.map((c) => {
    if (c.state !== "queued") return c;
    if (!all_refs_resolved(run_id, agent_calls, c.inputs)) return c;
    if (!is_enabled(run_id, agent_calls, c)) return c;
    return { ...c, state: "ready" as const };
  });
}

function reset_run_to_initial(run_id: string, agent_calls: AgentCall[]): AgentCall[] {
  let calls = agent_calls.map((c) => ({
    ...c,
    state: has_refs(c.inputs) ? ("queued" as const) : ("ready" as const),
    outputs: undefined,
    error_message: undefined,
  }));
  return mark_ready_where_possible(run_id, calls);
}

function get_effective_agent_calls(run: Run): AgentCall[] {
  const tab = get_selected_tab(run);
  return tab != null ? tab.agent_calls : run.agent_calls;
}

function apply_run_agent_calls_update(
  run: Run,
  updater: (calls: AgentCall[]) => AgentCall[]
): Run {
  const tab = get_selected_tab(run);
  if (run.tabs != null && run.tabs.length > 0 && tab != null && run.selected_tab_id != null) {
    return {
      ...run,
      tabs: run.tabs.map((t) =>
        t.id === run.selected_tab_id
          ? { ...t, agent_calls: updater(t.agent_calls) }
          : t
      ),
    };
  }
  return { ...run, agent_calls: updater(run.agent_calls) };
}

function apply_run_final_update(
  run: Run,
  update: { final_output?: string; final_error?: string }
): Run {
  const tab = get_selected_tab(run);
  if (run.tabs != null && run.tabs.length > 0 && tab != null && run.selected_tab_id != null) {
    return {
      ...run,
      tabs: run.tabs.map((t) =>
        t.id === run.selected_tab_id ? { ...t, ...update } : t
      ),
    };
  }
  return { ...run, ...update };
}

export default function Home() {
  const [runs, set_runs] = useState<Run[]>([]);
  const [selected_run_id, set_selected_run_id] = useState<string | null>(null);
  const [active_tab, set_active_tab] = useState<"runs" | "agents" | "data_sources">("runs");
  const [selected_agent_name, set_selected_agent_name] = useState<string | null>(null);
  const [selected_table_name, set_selected_table_name] = useState<string | null>(null);
  const [is_dialog_open, set_is_dialog_open] = useState(false);
  const [is_generating, set_is_generating] = useState(false);
  const [is_regenerating, set_is_regenerating] = useState(false);
  const [is_running_all, set_is_running_all] = useState(false);
  const [orchestrator_error, set_orchestrator_error] = useState<string | null>(null);

  const [has_loaded_from_storage, set_has_loaded_from_storage] = useState(false);
  const [sidebar_width, set_sidebar_width] = useState(DEFAULT_SIDEBAR_WIDTH);
  const runs_ref = useRef(runs);
  runs_ref.current = runs;

  const [graph_history_past, set_graph_history_past] = useState<GraphHistoryEntrySerialized[]>([]);
  const [graph_history_future, set_graph_history_future] = useState<GraphHistoryEntrySerialized[]>([]);

  const can_graph_undo = graph_history_past.length > 0;
  const can_graph_redo = graph_history_future.length > 0;

  useEffect(() => {
    const { runs: stored_runs, selected_run_id: stored_id } = load_runs_from_storage();
    const { past: stored_past, future: stored_future } = load_graph_history_from_storage();
    set_runs(stored_runs);
    set_selected_run_id(stored_id);
    set_graph_history_past(stored_past);
    set_graph_history_future(stored_future);
    const stored_width = typeof window !== "undefined" ? localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) : null;
    if (stored_width != null) {
      const w = Number(stored_width);
      if (!Number.isNaN(w) && w >= MIN_SIDEBAR_WIDTH && w <= MAX_SIDEBAR_WIDTH) set_sidebar_width(w);
    }
    set_has_loaded_from_storage(true);
  }, []);

  useEffect(() => {
    if (!has_loaded_from_storage) return;
    try {
      localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify({ runs, selected_run_id }));
    } catch {}
  }, [has_loaded_from_storage, runs, selected_run_id]);

  useEffect(() => {
    if (!has_loaded_from_storage) return;
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebar_width));
    } catch {}
  }, [has_loaded_from_storage, sidebar_width]);

  useEffect(() => {
    if (!has_loaded_from_storage) return;
    try {
      localStorage.setItem(GRAPH_HISTORY_STORAGE_KEY, JSON.stringify({ past: graph_history_past, future: graph_history_future }));
    } catch {}
  }, [has_loaded_from_storage, graph_history_past, graph_history_future]);

  const selected_run = useMemo(
    () => runs.find((r) => r.id === selected_run_id) ?? null,
    [runs, selected_run_id]
  );

  const selected_table = useMemo(
    () => EXAMPLE_TABLES.find((t) => t.name === selected_table_name) ?? null,
    [selected_table_name]
  );

  const selected_agent_doc = useMemo(
    () => IMPLEMENTED_AGENT_DOCS.find((d) => d.name === selected_agent_name) ?? null,
    [selected_agent_name]
  );

  const handle_delete_run = useCallback((run_id: string) => {
    set_runs((prev) => {
      const remaining = prev.filter((r) => r.id !== run_id);
      set_selected_run_id((current) => (current === run_id ? (remaining[0]?.id ?? null) : current));
      return remaining;
    });
  }, []);

  const handle_resize_start = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const start_x = e.clientX;
    const start_width = sidebar_width;
    const on_move = (move_e: MouseEvent) => {
      const delta = move_e.clientX - start_x;
      set_sidebar_width((w) => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, start_width + delta)));
    };
    const on_up = () => {
      document.removeEventListener("mousemove", on_move);
      document.removeEventListener("mouseup", on_up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", on_move);
    document.addEventListener("mouseup", on_up);
  }, [sidebar_width]);

  const handle_dag_positions_change = useCallback(
    (run_id: string, positions: Record<string, { x: number; y: number }>, tab_id?: string) => {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          if (tab_id != null && r.tabs != null && r.tabs.length > 0) {
            return {
              ...r,
              tabs: r.tabs.map((t) =>
                t.id === tab_id ? { ...t, dag_node_positions: positions } : t
              ),
            };
          }
          return { ...r, dag_node_positions: positions };
        })
      );
    },
    []
  );

  const record_positions_change = useCallback(
    (run_id: string, prev_positions: Record<string, { x: number; y: number }>, next_positions: Record<string, { x: number; y: number }>, tab_id?: string) => {
      const entry: GraphHistoryEntrySerialized = {
        type: "positions",
        run_id,
        tab_id,
        prev: prev_positions,
        next: next_positions,
      };
      set_graph_history_future([]);
      set_graph_history_past((p) => [...p, entry]);
    },
    []
  );

  const handle_dag_reset_positions = useCallback((run_id: string, tab_id?: string) => {
    set_runs((prev) =>
      prev.map((r) => {
        if (r.id !== run_id) return r;
        if (tab_id != null && r.tabs != null && r.tabs.length > 0) {
          return {
            ...r,
            tabs: r.tabs.map((t) =>
              t.id === tab_id ? { ...t, dag_node_positions: undefined } : t
            ),
          };
        }
        return { ...r, dag_node_positions: undefined };
      })
    );
  }, []);

  const handle_select_tab = useCallback((run_id: string, tab_id: string) => {
    set_runs((prev) =>
      prev.map((r) => (r.id !== run_id ? r : { ...r, selected_tab_id: tab_id }))
    );
  }, []);

  const handle_regenerate_dag = useCallback(async (run_id: string) => {
    const run = runs_ref.current.find((r) => r.id === run_id);
    if (!run) return;
    const selected_tab = get_selected_tab(run);
    if (selected_tab == null) return;
    set_is_regenerating(true);
    set_orchestrator_error(null);
    try {
      const { plan, execution_history } = tab_to_plan_and_history(run_id, selected_tab);
      const res = await fetch("/api/agents/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: run.initial_task,
          current_architecture: plan,
          execution_history,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        set_orchestrator_error(data.error ?? "Regenerate failed");
        return;
      }
      const new_plan = normalize_plan_to_call_ids(data as OrchestratorPlan);
      const new_tab = run_tab_from_plan(run_id, new_plan);
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          const tabs = get_effective_tabs(r);
          const next_tabs =
            r.tabs != null && r.tabs.length > 0
              ? [...r.tabs, new_tab]
              : [
                  {
                    id: `${r.id}-default`,
                    label: "Original",
                    agent_calls: r.agent_calls,
                    final_response_ref: r.final_response_ref,
                    final_output: r.final_output,
                    final_error: r.final_error,
                    dag_node_positions: r.dag_node_positions,
                  },
                  new_tab,
                ];
          return {
            ...r,
            tabs: next_tabs,
            selected_tab_id: new_tab.id,
          };
        })
      );
    } catch (err) {
      set_orchestrator_error(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      set_is_regenerating(false);
    }
  }, []);

  const handle_update_call = useCallback(
    (
      run_id: string,
      call_id: string,
      updates: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> },
      opts?: { replace_inputs?: boolean }
    ) => {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          return apply_run_agent_calls_update(r, (calls) =>
            calls.map((c) => {
              if (c.id !== call_id) return c;
              const next = { ...c, ...updates };
              if (updates.inputs != null) {
                next.inputs =
                  opts?.replace_inputs === true
                    ? { ...updates.inputs }
                    : { ...c.inputs, ...updates.inputs };
              }
              return next;
            })
          );
        })
      );
    },
    []
  );

  const handle_reset_outputs = useCallback(
    (run_id: string) => {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          const current_calls = get_effective_agent_calls(r);
          const reset_calls = reset_run_to_initial(run_id, current_calls);
          const with_calls = apply_run_agent_calls_update(r, () => reset_calls);
          return apply_run_final_update(with_calls, {
            final_output: undefined,
            final_error: undefined,
          });
        })
      );
    },
    []
  );

  const record_call_updates = useCallback(
    (run_id: string, updates: { call_id: string; prev_inputs: Record<string, unknown>; next_inputs: Record<string, unknown> }[]) => {
      if (updates.length === 0) return;
      const entry: GraphHistoryEntrySerialized = { type: "call_updates", run_id, updates };
      set_graph_history_future([]);
      set_graph_history_past((p) => [...p, entry]);
    },
    []
  );

  const graph_undo = useCallback(() => {
    set_graph_history_past((p) => {
      if (p.length === 0) return p;
      const entry = p[p.length - 1];
      if (entry.type === "positions") {
        handle_dag_positions_change(entry.run_id, entry.prev, entry.tab_id);
      } else {
        entry.updates.forEach((u) =>
          handle_update_call(entry.run_id, u.call_id, { inputs: { ...u.prev_inputs } }, { replace_inputs: true })
        );
      }
      set_graph_history_future((f) => [...f, entry]);
      return p.slice(0, -1);
    });
  }, [handle_dag_positions_change, handle_update_call]);

  const graph_redo = useCallback(() => {
    set_graph_history_future((f) => {
      if (f.length === 0) return f;
      const entry = f[f.length - 1];
      if (entry.type === "positions") {
        handle_dag_positions_change(entry.run_id, entry.next, entry.tab_id);
      } else {
        entry.updates.forEach((u) =>
          handle_update_call(entry.run_id, u.call_id, { inputs: { ...u.next_inputs } }, { replace_inputs: true })
        );
      }
      set_graph_history_past((p) => [...p, entry]);
      return f.slice(0, -1);
    });
  }, [handle_dag_positions_change, handle_update_call]);

  const handle_run_agent = useCallback(async (run_id: string, call_id: string, options?: { simulate_empty_output?: boolean }) => {
    const run = runs_ref.current.find((r) => r.id === run_id);
    if (!run) return;
    const agent_calls = get_effective_agent_calls(run);
    const call = agent_calls.find((c) => c.id === call_id);
    const can_run =
      call &&
      (call.state === "ready" ||
        call.state === "finished" ||
        call.state === "error" ||
        call.state === "queued");
    if (!can_run) return;
    if (options?.simulate_empty_output === true) {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          return apply_run_agent_calls_update(r, (calls) => {
            const next_calls = calls.map((c) =>
              c.id === call_id ? { ...c, state: "finished" as const, outputs: {} } : c
            );
            return mark_ready_where_possible(r.id, next_calls);
          });
        })
      );
      return;
    }
    const url = AGENT_API[call.agent_name];
    if (!url) {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          return apply_run_agent_calls_update(r, (calls) =>
            calls.map((c) =>
              c.id === call_id
                ? {
                    ...c,
                    state: "error" as const,
                    error_message: `No API configured for agent "${call.agent_name}".`,
                  }
                : c
            )
          );
        })
      );
      return;
    }
    const resolved = resolve_refs_in_inputs(run_id, agent_calls, call.inputs, {
      agent_docs_by_name: AGENT_DOCS_BY_NAME,
      initial_task: run.initial_task,
    });
    if (has_refs(resolved)) {
      const unresolved = get_unresolved_ref_call_ids(run_id, agent_calls, call.inputs);
      const step_list =
        unresolved.length > 0
          ? unresolved
              .map((id) => {
                const dep = agent_calls.find(
                  (c) => c.id === id || c.id === `${run_id}-${id}` || c.id.endsWith(`-${id}`)
                );
                return dep ? `${dep.agent_name} (${id})` : id;
              })
              .join(", ")
          : "";
      const message =
        step_list.length > 0
          ? `Unresolved refs: run these steps first — ${step_list}.`
          : "Refs could not be resolved. Run dependency steps first (e.g. run call_1 before call_2).";
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          return apply_run_agent_calls_update(r, (calls) =>
            calls.map((c) =>
              c.id === call_id
                ? { ...c, state: "error" as const, error_message: message }
                : c
            )
          );
        })
      );
      return;
    }
    const body =
      call.agent_name === "Human response generator"
        ? {
            data: resolved.results ?? resolved.data,
            question: (resolved.question as string) ?? "",
          }
        : resolved;
    set_runs((prev) =>
      prev.map((r) => {
        if (r.id !== run_id) return r;
        return apply_run_agent_calls_update(r, (calls) =>
          calls.map((c) => (c.id === call_id ? { ...c, state: "running" as const } : c))
        );
      })
    );
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        set_runs((prev) =>
          prev.map((r) => {
            if (r.id !== run_id) return r;
            return apply_run_agent_calls_update(r, (calls) =>
              calls.map((c) =>
                c.id === call_id
                  ? { ...c, state: "error" as const, error_message: data.error ?? "Request failed" }
                  : c
              )
            );
          })
        );
        return;
      }
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          return apply_run_agent_calls_update(r, (calls) => {
            const next_calls = calls.map((c) =>
              c.id === call_id ? { ...c, state: "finished" as const, outputs: data } : c
            );
            return mark_ready_where_possible(r.id, next_calls);
          });
        })
      );
    } catch (err) {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          return apply_run_agent_calls_update(r, (calls) =>
            calls.map((c) =>
              c.id === call_id
                ? {
                    ...c,
                    state: "error" as const,
                    error_message: err instanceof Error ? err.message : String(err),
                  }
                : c
            )
          );
        })
      );
    }
  }, []);

  const handle_run_all = useCallback(async (run_id: string, error_simulation_call_ids?: Set<string>) => {
    const run = runs.find((r) => r.id === run_id);
    if (!run) return;
    const agent_calls = get_effective_agent_calls(run);
    set_is_running_all(true);
    let current_calls = reset_run_to_initial(run_id, agent_calls);
    set_runs((prev) =>
      prev.map((r) =>
        r.id !== run_id
          ? r
          : apply_run_final_update(
              apply_run_agent_calls_update(r, () => current_calls),
              { final_output: undefined, final_error: undefined }
            )
      )
    );
    while (true) {
      const ready = current_calls.filter((c) => c.state === "ready");
      if (ready.length === 0) break;
      const running_ids = new Set(ready.map((c) => c.id));
      current_calls = current_calls.map((c) =>
        running_ids.has(c.id) ? { ...c, state: "running" as const } : c
      );
      set_runs((prev) =>
        prev.map((r) => (r.id !== run_id ? r : apply_run_agent_calls_update(r, () => current_calls)))
      );
      const results = await Promise.allSettled(
        ready.map(async (call) => {
          if (error_simulation_call_ids?.has(call.id)) {
            return { call_id: call.id, data: {} };
          }
          const url = AGENT_API[call.agent_name];
          if (!url) return { call_id: call.id, error: "No API" };
          const resolved = resolve_refs_in_inputs(run_id, current_calls, call.inputs, {
            agent_docs_by_name: AGENT_DOCS_BY_NAME,
            initial_task: run.initial_task,
          });
          if (has_refs(resolved)) {
            const unresolved = get_unresolved_ref_call_ids(run_id, current_calls, call.inputs);
            const step_list = unresolved
              .map((id) => {
                const dep = current_calls.find(
                  (c) => c.id === id || c.id === `${run_id}-${id}` || c.id.endsWith(`-${id}`)
                );
                return dep ? `${dep.agent_name} (${id})` : id;
              })
              .join(", ");
            return {
              call_id: call.id,
              error: step_list.length > 0
                ? `Unresolved refs: run these first — ${step_list}.`
                : "Refs could not be resolved. Dependency steps may not have finished.",
            };
          }
          const body =
            call.agent_name === "Human response generator" && resolved.results != null
              ? { data: resolved.results, question: (resolved.question as string) ?? "" }
              : resolved;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) return { call_id: call.id, error: data.error ?? "Request failed" };
          return { call_id: call.id, data };
        })
      );
      for (let i = 0; i < ready.length; i++) {
        const result = results[i];
        const call = ready[i];
        if (result.status === "fulfilled" && (result.value as { error?: string }).error == null) {
          const value = result.value as { call_id: string; data: Record<string, unknown> };
          current_calls = current_calls.map((c) =>
            c.id === call.id ? { ...c, state: "finished" as const, outputs: value.data } : c
          );
        } else {
          const err =
            result.status === "fulfilled"
              ? (result.value as { error?: string }).error
              : (result as PromiseRejectedResult).reason instanceof Error
                ? (result as PromiseRejectedResult).reason.message
                : String((result as PromiseRejectedResult).reason);
          current_calls = current_calls.map((c) =>
            c.id === call.id ? { ...c, state: "error" as const, error_message: err ?? "Failed" } : c
          );
        }
      }
      current_calls = mark_ready_where_possible(run_id, current_calls);
      set_runs((prev) =>
        prev.map((r) => (r.id !== run_id ? r : apply_run_agent_calls_update(r, () => current_calls)))
      );
    }
    set_is_running_all(false);
  }, [runs]);

  const handle_new_run_submit = useCallback(async (task: string) => {
    set_is_generating(true);
    set_orchestrator_error(null);
    try {
      const res = await fetch("/api/agents/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const data = await res.json();
      if (!res.ok) {
        set_orchestrator_error(data.error ?? "Orchestrator failed");
        return;
      }
      const plan = data as OrchestratorPlan;
      const normalized_plan = normalize_plan_to_call_ids(plan);
      const new_run = run_from_orchestrator_plan(task, normalized_plan);
      set_runs((prev) => [new_run, ...prev]);
      set_selected_run_id(new_run.id);
    } catch (err) {
      set_orchestrator_error(err instanceof Error ? err.message : "Request failed");
    } finally {
      set_is_generating(false);
    }
  }, []);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200">
      <div className="flex h-full shrink-0 flex-col" style={{ width: sidebar_width }}>
        <Sidebar
          runs={runs}
          selected_run_id={selected_run_id}
          on_select_run={set_selected_run_id}
          on_new_run_click={() => set_is_dialog_open(true)}
          on_delete_run={handle_delete_run}
          active_tab={active_tab}
          on_select_tab={set_active_tab}
          selected_agent_name={selected_agent_name}
          on_select_agent={set_selected_agent_name}
          selected_table_name={selected_table_name}
          on_select_table={set_selected_table_name}
        />
      </div>
      <div
        role="separator"
        aria-label="Resize sidebar"
        onMouseDown={handle_resize_start}
        className="w-1 shrink-0 cursor-col-resize border-r border-zinc-800 bg-transparent hover:bg-blue-500/20 transition-colors"
      />
      <main className="flex-1 min-w-0 flex flex-col">
        {active_tab === "data_sources" ? (
          <DataSourcesView
            selected_table_name={selected_table_name}
            selected_table={selected_table}
          />
        ) : active_tab === "agents" ? (
          selected_agent_doc != null ? (
            <AgentDetailView doc={selected_agent_doc} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm">
              Select an agent
            </div>
          )
        ) : selected_run != null ? (
          <RunDetail
            run={selected_run}
            run_id={selected_run.id}
            on_run_agent={handle_run_agent}
            on_run_all={handle_run_all}
            on_reset_outputs={handle_reset_outputs}
            on_update_call={handle_update_call}
            on_dag_positions_change={handle_dag_positions_change}
            on_dag_reset_positions={handle_dag_reset_positions}
            on_select_tab={handle_select_tab}
            on_regenerate_dag={handle_regenerate_dag}
            on_record_call_updates={record_call_updates}
            on_record_positions_change={record_positions_change}
            on_graph_undo={graph_undo}
            on_graph_redo={graph_redo}
            can_graph_undo={can_graph_undo}
            can_graph_redo={can_graph_redo}
            is_running_all={is_running_all}
            is_regenerating={is_regenerating}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm">
            Select a run or start a new one
          </div>
        )}
      </main>
      <NewRunDialog
        is_open={is_dialog_open}
        on_close={() => set_is_dialog_open(false)}
        on_submit={handle_new_run_submit}
      />
      <OrchestratorLoadingOverlay
        is_visible={is_generating || is_regenerating}
        error={orchestrator_error}
        on_dismiss_error={() => set_orchestrator_error(null)}
      />
    </div>
  );
}
