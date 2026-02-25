import { Database } from "lucide-react";
import { TableCard } from "./table_card";
import type { ExampleTable } from "@/types/data_sources";

export function DataSourcesView({
  selected_table_name,
  selected_table,
}: {
  selected_table_name: string | null;
  selected_table: ExampleTable | null;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-900/30 px-6 py-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-zinc-500" />
          <h1 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Data sources
          </h1>
        </div>
        <p className="mt-1.5 text-zinc-400 text-sm">
          {selected_table != null
            ? `Viewing table: ${selected_table.name} (${selected_table.sample_rows.length} rows)`
            : "Select a table in the sidebar to view its data."}
        </p>
      </div>
      <div className="flex-1 overflow-hidden p-6">
        {selected_table != null ? (
          <div className="h-full min-h-0 flex flex-col">
            <TableCard table={selected_table} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500 text-sm">
            Select a table from the sidebar
          </div>
        )}
      </div>
    </div>
  );
}
