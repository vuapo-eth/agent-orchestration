"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { Run, AgentCall } from "@/types/orchestration";
import type { OrchestratorPlan, OrchestratorCall } from "@/types/orchestrator";
import { has_refs, resolve_refs_in_inputs, all_refs_resolved, normalize_plan_to_call_ids, get_unresolved_ref_call_ids } from "@/utils/refs";
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

export default function Home() {
  const [runs, set_runs] = useState<Run[]>([]);
  const [selected_run_id, set_selected_run_id] = useState<string | null>(null);
  const [active_tab, set_active_tab] = useState<"runs" | "agents" | "data_sources">("runs");
  const [selected_agent_name, set_selected_agent_name] = useState<string | null>(null);
  const [selected_table_name, set_selected_table_name] = useState<string | null>(null);
  const [is_dialog_open, set_is_dialog_open] = useState(false);
  const [is_generating, set_is_generating] = useState(false);
  const [is_running_all, set_is_running_all] = useState(false);
  const [orchestrator_error, set_orchestrator_error] = useState<string | null>(null);

  const [has_loaded_from_storage, set_has_loaded_from_storage] = useState(false);
  const [sidebar_width, set_sidebar_width] = useState(DEFAULT_SIDEBAR_WIDTH);
  const runs_ref = useRef(runs);
  runs_ref.current = runs;

  useEffect(() => {
    const { runs: stored_runs, selected_run_id: stored_id } = load_runs_from_storage();
    set_runs(stored_runs);
    set_selected_run_id(stored_id);
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

  const handle_update_call = useCallback(
    (run_id: string, call_id: string, updates: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> }) => {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          return {
            ...r,
            agent_calls: r.agent_calls.map((c) =>
              c.id !== call_id ? c : { ...c, ...updates }
            ),
          };
        })
      );
    },
    []
  );

  const handle_dag_positions_change = useCallback(
    (run_id: string, positions: Record<string, { x: number; y: number }>) => {
      set_runs((prev) =>
        prev.map((r) => (r.id !== run_id ? r : { ...r, dag_node_positions: positions }))
      );
    },
    []
  );

  const handle_dag_reset_positions = useCallback((run_id: string) => {
    set_runs((prev) =>
      prev.map((r) => (r.id !== run_id ? r : { ...r, dag_node_positions: undefined }))
    );
  }, []);

  const handle_run_agent = useCallback(async (run_id: string, call_id: string, options?: { simulate_empty_output?: boolean }) => {
    const run = runs_ref.current.find((r) => r.id === run_id);
    if (!run) return;
    const call = run.agent_calls.find((c) => c.id === call_id);
    const can_run =
      call &&
      (call.state === "ready" || call.state === "finished" || call.state === "error");
    if (!can_run) return;
    if (options?.simulate_empty_output === true) {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          const next_calls = r.agent_calls.map((c) =>
            c.id === call_id ? { ...c, state: "finished" as const, outputs: {} } : c
          );
          const with_ready = mark_ready_where_possible(r.id, next_calls);
          return { ...r, agent_calls: with_ready };
        })
      );
      return;
    }
    const url = AGENT_API[call.agent_name];
    if (!url) {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          return {
            ...r,
            agent_calls: r.agent_calls.map((c) =>
              c.id === call_id
                ? {
                    ...c,
                    state: "error" as const,
                    error_message: `No API configured for agent "${call.agent_name}".`,
                  }
                : c
            ),
          };
        })
      );
      return;
    }
    const resolved = resolve_refs_in_inputs(run_id, run.agent_calls, call.inputs, {
      agent_docs_by_name: AGENT_DOCS_BY_NAME,
      initial_task: run.initial_task,
    });
    if (has_refs(resolved)) {
      const unresolved = get_unresolved_ref_call_ids(run_id, run.agent_calls, call.inputs);
      const step_list =
        unresolved.length > 0
          ? unresolved
              .map((id) => {
                const dep = run.agent_calls.find(
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
          return {
            ...r,
            agent_calls: r.agent_calls.map((c) =>
              c.id === call_id
                ? {
                    ...c,
                    state: "error" as const,
                    error_message: message,
                  }
                : c
            ),
          };
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
        return {
          ...r,
          agent_calls: r.agent_calls.map((c) =>
            c.id === call_id ? { ...c, state: "running" as const } : c
          ),
        };
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
            return {
              ...r,
              agent_calls: r.agent_calls.map((c) =>
                c.id === call_id
                  ? { ...c, state: "error" as const, error_message: data.error ?? "Request failed" }
                  : c
              ),
            };
          })
        );
        return;
      }
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          const next_calls = r.agent_calls.map((c) =>
            c.id === call_id ? { ...c, state: "finished" as const, outputs: data } : c
          );
          const with_ready = mark_ready_where_possible(r.id, next_calls);
          return { ...r, agent_calls: with_ready };
        })
      );
    } catch (err) {
      set_runs((prev) =>
        prev.map((r) => {
          if (r.id !== run_id) return r;
          return {
            ...r,
            agent_calls: r.agent_calls.map((c) =>
              c.id === call_id
                ? {
                    ...c,
                    state: "error" as const,
                    error_message: err instanceof Error ? err.message : String(err),
                  }
                : c
            ),
          };
        })
      );
    }
  }, [runs]);

  const handle_run_all = useCallback(async (run_id: string, error_simulation_call_ids?: Set<string>) => {
    const run = runs.find((r) => r.id === run_id);
    if (!run) return;
    set_is_running_all(true);
    let current_calls = reset_run_to_initial(run_id, run.agent_calls);
    set_runs((prev) =>
      prev.map((r) =>
        r.id !== run_id
          ? r
          : {
              ...r,
              agent_calls: current_calls,
              final_output: undefined,
              final_error: undefined,
            }
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
        prev.map((r) => (r.id !== run_id ? r : { ...r, agent_calls: current_calls }))
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
        prev.map((r) => (r.id !== run_id ? r : { ...r, agent_calls: current_calls }))
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
            on_update_call={handle_update_call}
            on_dag_positions_change={handle_dag_positions_change}
            on_dag_reset_positions={handle_dag_reset_positions}
            is_running_all={is_running_all}
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
        is_visible={is_generating}
        error={orchestrator_error}
        on_dismiss_error={() => set_orchestrator_error(null)}
      />
    </div>
  );
}
