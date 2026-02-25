import { RunListItem } from "./run_list_item";
import { SidebarAgentItem } from "./sidebar_agent_item";
import { Plus, Database, ListChecks, Bot } from "lucide-react";
import type { Run } from "@/types/orchestration";
import { IMPLEMENTED_AGENT_DOCS } from "@/lib/agents";
import { EXAMPLE_TABLES } from "@/data/example_tables";

export function Sidebar({
  runs,
  selected_run_id,
  on_select_run,
  on_new_run_click,
  on_delete_run,
  active_tab,
  on_select_tab,
  selected_agent_name,
  on_select_agent,
  selected_table_name,
  on_select_table,
}: {
  runs: Run[];
  selected_run_id: string | null;
  on_select_run: (id: string) => void;
  on_new_run_click: () => void;
  on_delete_run: (run_id: string) => void;
  active_tab: "runs" | "agents" | "data_sources";
  on_select_tab: (tab: "runs" | "agents" | "data_sources") => void;
  selected_agent_name: string | null;
  on_select_agent: (name: string) => void;
  selected_table_name: string | null;
  on_select_table: (table_name: string) => void;
}) {
  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r border-zinc-800 bg-zinc-900/50">
      <div className="flex border-b border-zinc-800">
        <button
          type="button"
          onClick={() => on_select_tab("runs")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-3 text-xs font-medium transition-colors ${
            active_tab === "runs"
              ? "bg-zinc-800 text-zinc-100 border-b-2 border-blue-500"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          }`}
        >
          <ListChecks className="h-3.5 w-3.5" />
          Runs
        </button>
        <button
          type="button"
          onClick={() => on_select_tab("agents")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-3 text-xs font-medium transition-colors ${
            active_tab === "agents"
              ? "bg-zinc-800 text-zinc-100 border-b-2 border-blue-500"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          }`}
        >
          <Bot className="h-3.5 w-3.5" />
          Agents
        </button>
        <button
          type="button"
          onClick={() => on_select_tab("data_sources")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-3 text-xs font-medium transition-colors ${
            active_tab === "data_sources"
              ? "bg-zinc-800 text-zinc-100 border-b-2 border-blue-500"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          }`}
        >
          <Database className="h-3.5 w-3.5" />
          Data
        </button>
      </div>
      {active_tab === "runs" && (
        <>
          <div className="border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Runs</h2>
              <button
                type="button"
                onClick={on_new_run_click}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                <Plus className="h-3.5 w-3.5" />
                New run
              </button>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-2 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto">
              {runs.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-zinc-500">No runs yet</div>
              ) : (
                runs.map((run) => (
                  <RunListItem
                    key={run.id}
                    run={run}
                    is_selected={selected_run_id === run.id}
                    on_select={() => on_select_run(run.id)}
                    on_delete={() => on_delete_run(run.id)}
                  />
                ))
              )}
            </div>
          </nav>
        </>
      )}
      {active_tab === "agents" && (
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          <div className="space-y-2">
            {IMPLEMENTED_AGENT_DOCS.map((doc) => (
              <SidebarAgentItem
                key={doc.name}
                doc={doc}
                is_selected={selected_agent_name === doc.name}
                on_select={() => on_select_agent(doc.name)}
              />
            ))}
          </div>
        </div>
      )}
      {active_tab === "data_sources" && (
        <div className="flex-1 overflow-y-auto p-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">
            Example tables
          </h2>
          <ul className="space-y-0.5">
            {EXAMPLE_TABLES.map((t) => (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => on_select_table(t.name)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm font-mono transition-colors ${
                    selected_table_name === t.name
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                  }`}
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
