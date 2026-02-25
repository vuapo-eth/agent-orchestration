"use client";

export function OrchestratorLoadingOverlay({
  is_visible,
  error,
  on_dismiss_error,
}: {
  is_visible: boolean;
  error?: string | null;
  on_dismiss_error?: () => void;
}) {
  if (!is_visible && !error) return null;

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-md p-4">
        <div className="max-w-md rounded-xl border border-red-900/80 bg-red-950/30 p-6">
          <p className="text-sm font-medium text-red-400">Orchestrator failed</p>
          <p className="mt-2 text-sm text-zinc-300">{error}</p>
          {on_dismiss_error && (
            <button
              type="button"
              onClick={on_dismiss_error}
              className="mt-4 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-md">
      <div className="relative flex h-36 w-36 items-center justify-center">
        <div
          className="orchestrator-ring absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, #2563eb, #7c3aed, #a855f7, #3b82f6, #2563eb)",
            animation: "orchestrator-spin 1.8s linear infinite",
          }}
        />
        <div
          className="absolute inset-[4px] rounded-full bg-zinc-950"
          style={{ boxShadow: "inset 0 0 20px rgba(59, 130, 246, 0.2)" }}
        />
        <div
          className="orchestrator-glow absolute -inset-4 rounded-full opacity-80"
          style={{
            background: "radial-gradient(circle, transparent 30%, rgba(59, 130, 246, 0.25) 50%, rgba(139, 92, 246, 0.2) 70%, transparent 85%)",
            animation: "orchestrator-pulse 1.5s ease-in-out infinite",
          }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow:
              "0 0 50px 6px rgba(59, 130, 246, 0.45), 0 0 80px 16px rgba(139, 92, 246, 0.25)",
            animation: "orchestrator-pulse 1.5s ease-in-out infinite",
          }}
        />
      </div>
      <p className="mt-8 text-sm font-medium text-zinc-400">Orchestrator generating...</p>
    </div>
  );
}
