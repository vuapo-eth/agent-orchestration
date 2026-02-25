import { Trash2 } from "lucide-react";

function format_run_time(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff_min = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diff_min < 1) return "Just now";
  if (diff_min < 60) return `${diff_min}m ago`;
  const diff_h = Math.floor(diff_min / 60);
  if (diff_h < 24) return `${diff_h}h ago`;
  return d.toLocaleDateString();
}

export function RunListItem({
  run,
  is_selected,
  on_select,
  on_delete,
}: {
  run: { id: string; created_at: string; initial_task: string };
  is_selected: boolean;
  on_select: () => void;
  on_delete: () => void;
}) {
  return (
    <div
      className={`group flex items-start gap-2 rounded-lg px-3 py-2.5 transition-colors ${
        is_selected
          ? "bg-zinc-700/80 text-zinc-50"
          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300"
      }`}
    >
      <button
        type="button"
        onClick={on_select}
        className="min-w-0 flex-1 text-left"
      >
        <div className="text-xs text-zinc-500 mb-0.5">{format_run_time(run.created_at)}</div>
        <div className="line-clamp-2 text-sm font-medium">{run.initial_task}</div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          on_delete();
        }}
        className={`shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-opacity ${
          is_selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        aria-label="Delete run"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
