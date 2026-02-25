import { useState, useMemo } from "react";
import type { ExampleTable } from "@/types/data_sources";
import { Pagination } from "./pagination";

const DEFAULT_PAGE_SIZE = 10;

function format_cell_value(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return String(value);
}

export function TableCard({
  table,
  page_size = DEFAULT_PAGE_SIZE,
}: {
  table: ExampleTable;
  page_size?: number;
}) {
  const [page, set_page] = useState(1);
  const all_columns = useMemo(() => {
    if (table.columns.length > 0) {
      return table.columns.map((c) => ({ name: c.name, type: c.type }));
    }
    const keys =
      table.sample_rows.length > 0
        ? Object.keys(table.sample_rows[0] as Record<string, unknown>)
        : [];
    return keys.map((key) => ({ name: key, type: "" }));
  }, [table.columns, table.sample_rows]);

  const total_pages = useMemo(
    () => Math.max(1, Math.ceil(table.sample_rows.length / page_size)),
    [table.sample_rows.length, page_size]
  );
  const start = (page - 1) * page_size;
  const page_rows = useMemo(
    () => table.sample_rows.slice(start, start + page_size),
    [table.sample_rows, start, page_size]
  );

  const go_to_prev = () => set_page((p) => Math.max(1, p - 1));
  const go_to_next = () => set_page((p) => Math.min(total_pages, p + 1));
  const go_to_page = (p: number) => set_page(Math.max(1, Math.min(total_pages, p)));

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900/50 shadow-md flex flex-col">
      <div className="border-b border-zinc-700/50 px-5 py-3.5 bg-zinc-800/30 shrink-0">
        <h3 className="font-semibold text-zinc-100">{table.name}</h3>
      </div>
      <div className="overflow-x-auto flex-1 min-h-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-700/50">
              {all_columns.map((col) => (
                <th
                  key={col.name}
                  className="px-4 py-2.5 text-left font-medium text-zinc-400 bg-zinc-800/20"
                >
                  <div>{col.name}</div>
                  {col.type ? (
                    <div className="text-xs font-normal text-zinc-500 mt-0.5">
                      {col.type}
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page_rows.map((row, i) => (
              <tr
                key={start + i}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
              >
                {all_columns.map((col) => (
                  <td
                    key={col.name}
                    className="px-4 py-2.5 text-zinc-300 font-mono text-xs"
                  >
                    {format_cell_value((row as Record<string, unknown>)[col.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        total_pages={total_pages}
        on_prev={go_to_prev}
        on_next={go_to_next}
        on_go_to_page={go_to_page}
      />
    </div>
  );
}
