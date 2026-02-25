import { AgentCallCard } from "./agent_call_card";
import { AgentDocDialog } from "./agent_doc_dialog";
import { RunDagView } from "./run_dag_view";
import { IMPLEMENTED_AGENT_DOCS } from "@/lib/agents";
import type { Run } from "@/types/orchestration";
import { useState, useCallback } from "react";
import { Play, Loader2 } from "lucide-react";
import { has_refs, resolve_refs_in_inputs } from "@/utils/refs";

export function RunDetail({
  run,
  run_id,
  on_run_agent,
  on_run_all,
  on_update_call,
  is_running_all,
}: {
  run: Run;
  run_id: string;
  on_run_agent: (run_id: string, call_id: string) => void;
  on_run_all?: (run_id: string) => void;
  on_update_call?: (run_id: string, call_id: string, updates: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> }) => void;
  is_running_all?: boolean;
}) {
  const [popup_agent_name, set_popup_agent_name] = useState<string | null>(null);
  const [selected_call_id, set_selected_call_id] = useState<string | null>(null);
  const popup_doc = IMPLEMENTED_AGENT_DOCS.find((d) => d.name === popup_agent_name) ?? null;

  const handle_agent_name_click = useCallback((agent_name: string) => {
    if (!IMPLEMENTED_AGENT_DOCS.some((d) => d.name === agent_name)) return;
    set_popup_agent_name(agent_name);
  }, []);

  const handle_close_popup = useCallback(() => {
    set_popup_agent_name(null);
  }, []);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/30 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Initial task
              </h1>
              <p className="mt-1.5 text-zinc-200 leading-relaxed">{run.initial_task}</p>
            </div>
            {on_run_all != null && (
              <button
                type="button"
                onClick={() => on_run_all(run_id)}
                disabled={is_running_all}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {is_running_all ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run all
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 border-b border-zinc-800 px-6 py-4">
          <RunDagView
            run={run}
            selected_call_id={selected_call_id}
            on_select_call={set_selected_call_id}
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4 p-6">
            {selected_call_id != null && (
              <p className="text-xs text-zinc-500">
                Showing selected agent. Click the DAG background to show all.
              </p>
            )}
            {(selected_call_id != null
              ? run.agent_calls.filter((c) => c.id === selected_call_id)
              : run.agent_calls
            ).map((call, index) => {
              const full_index = run.agent_calls.findIndex((c) => c.id === call.id);
              const resolved_inputs = resolve_refs_in_inputs(run.id, run.agent_calls, call.inputs);
              const refs_fully_resolved = !has_refs(resolved_inputs);
              return (
                <AgentCallCard
                  key={call.id}
                  call={call}
                  index={full_index >= 0 ? full_index : index}
                  run_id={run_id}
                  resolved_inputs={refs_fully_resolved ? resolved_inputs : undefined}
                  on_run_agent={on_run_agent}
                  on_agent_name_click={handle_agent_name_click}
                  on_update_call={on_update_call}
                />
              );
            })}
          </div>

          {(run.final_output != null || run.final_error != null) && (
            <div className="border-t border-zinc-800 bg-zinc-900/20 px-6 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Final output
              </h2>
              {run.final_error != null ? (
                <p className="mt-2 text-sm text-red-400">{run.final_error}</p>
              ) : (
                <p className="mt-2 text-sm text-zinc-300 leading-relaxed">{run.final_output}</p>
              )}
            </div>
          )}
        </div>
      </div>
      <AgentDocDialog
        is_open={popup_agent_name != null}
        on_close={handle_close_popup}
        doc={popup_doc}
      />
    </>
  );
}
