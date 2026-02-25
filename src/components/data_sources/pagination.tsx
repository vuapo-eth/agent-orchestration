import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page,
  total_pages,
  on_prev,
  on_next,
  on_go_to_page,
}: {
  page: number;
  total_pages: number;
  on_prev: () => void;
  on_next: () => void;
  on_go_to_page: (page: number) => void;
}) {
  const can_prev = page > 1;
  const can_next = page < total_pages;
  const pages: number[] = [];
  const radius = 2;
  for (let i = Math.max(1, page - radius); i <= Math.min(total_pages, page + radius); i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-700/50 bg-zinc-800/20">
      <button
        type="button"
        onClick={on_prev}
        disabled={!can_prev}
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 disabled:opacity-40 disabled:pointer-events-none"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>
      <div className="flex items-center gap-1">
        {pages[0] > 1 && (
          <>
            <button
              type="button"
              onClick={() => on_go_to_page(1)}
              className="min-w-[2rem] rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
            >
              1
            </button>
            {pages[0] > 2 && <span className="text-zinc-600 px-1">…</span>}
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => on_go_to_page(p)}
            className={`min-w-[2rem] rounded-lg px-2 py-1.5 text-xs font-medium ${
              p === page
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
            }`}
          >
            {p}
          </button>
        ))}
        {pages[pages.length - 1] < total_pages && (
          <>
            {pages[pages.length - 1] < total_pages - 1 && (
              <span className="text-zinc-600 px-1">…</span>
            )}
            <button
              type="button"
              onClick={() => on_go_to_page(total_pages)}
              className="min-w-[2rem] rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50"
            >
              {total_pages}
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={on_next}
        disabled={!can_next}
        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 disabled:opacity-40 disabled:pointer-events-none"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
