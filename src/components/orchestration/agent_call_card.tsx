import type { AgentCallState } from "@/types/orchestration";
import { CircleDot, Loader2, CheckCircle, XCircle, Play } from "lucide-react";
import { JsonBlock } from "./json_block";
import { EditableJsonBlock } from "./editable_json_block";
import { get_agent_color } from "@/utils/agent_color";
import { IMPLEMENTED_AGENT_DOCS } from "@/lib/agents";

function get_field_descriptions_for_call(agent_name: string): {
  input_descriptions: Record<string, string>;
  output_descriptions: Record<string, string>;
} {
  const doc = IMPLEMENTED_AGENT_DOCS.find((d) => d.name === agent_name);
  if (!doc) {
    return { input_descriptions: {}, output_descriptions: {} };
  }
  const input_descriptions = Object.fromEntries(
    doc.args.map((a) => [a.name, `${a.purpose} (${a.format})`])
  );
  const output_descriptions = Object.fromEntries(
    Object.entries(doc.output_schema).map(([k, v]) => [k, v.description])
  );
  return { input_descriptions, output_descriptions };
}

const STATE_CONFIG: Record<
  AgentCallState,
  { label: string; icon: typeof CircleDot; class: string }
> = {
  queued: {
    label: "Queued",
    icon: CircleDot,
    class: "text-zinc-500",
  },
  ready: {
    label: "Ready",
    icon: Play,
    class: "text-cyan-400",
  },
  running: {
    label: "Running",
    icon: Loader2,
    class: "text-amber-400",
  },
  finished: {
    label: "Finished",
    icon: CheckCircle,
    class: "text-emerald-500",
  },
  error: {
    label: "Error",
    icon: XCircle,
    class: "text-red-400",
  },
};

export function AgentCallCard({
  call,
  index,
  run_id,
  resolved_inputs,
  on_run_agent,
  on_agent_name_click,
  on_update_call,
}: {
  call: {
    id: string;
    agent_name: string;
    state: AgentCallState;
    inputs: Record<string, unknown>;
    outputs?: Record<string, unknown>;
    error_message?: string;
  };
  index: number;
  run_id?: string;
  resolved_inputs?: Record<string, unknown>;
  on_run_agent?: (run_id: string, call_id: string) => void;
  on_agent_name_click?: (agent_name: string) => void;
  on_update_call?: (run_id: string, call_id: string, updates: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> }) => void;
}) {
  const config = STATE_CONFIG[call.state];
  const Icon = config.icon;
  const color = get_agent_color(call.agent_name);
  const { input_descriptions, output_descriptions } = get_field_descriptions_for_call(call.agent_name);
  const has_doc = IMPLEMENTED_AGENT_DOCS.some((d) => d.name === call.agent_name);
  const short_id = call.id.includes("-") ? call.id.split("-").slice(2).join("-") || call.id : call.id;

  return (
    <div className={`rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900/50 shadow-md ${color.border} border-l-4`}>
      <div className="flex items-center gap-3 border-b border-zinc-700/50 px-5 py-3.5 bg-zinc-800/30">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${color.badge}`}>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-zinc-100 truncate">
            {has_doc && on_agent_name_click ? (
              <button
                type="button"
                onClick={() => on_agent_name_click(call.agent_name)}
                className="text-left w-full truncate cursor-pointer hover:text-cyan-300 hover:underline focus:outline-none focus:ring-0"
              >
                {call.agent_name}
              </button>
            ) : (
              call.agent_name
            )}
          </h3>
          <div className={`flex items-center gap-2 text-xs font-medium ${config.class}`}>
            <Icon
              className={`h-4 w-4 shrink-0 ${call.state === "running" ? "animate-spin" : ""}`}
            />
            <span>{config.label}</span>
            <span className="text-zinc-500 font-mono">({short_id})</span>
          </div>
        </div>
    {(call.state === "ready" || call.state === "finished" || call.state === "error") &&
     run_id != null &&
     on_run_agent != null && (
          <button
            type="button"
            onClick={() => on_run_agent(run_id, call.id)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            aria-label={call.state === "ready" ? "Run agent" : "Run again"}
          >
            <Play className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-5 p-5">
        <div className="min-w-0">
          {on_update_call != null && run_id != null ? (
            <EditableJsonBlock
              data={call.inputs}
              display_data={resolved_inputs ?? undefined}
              label={resolved_inputs != null ? "Inputs (resolved)" : "Inputs"}
              field_descriptions={input_descriptions}
              on_save={(new_data) => on_update_call(run_id, call.id, { inputs: new_data })}
            />
          ) : (
            <JsonBlock
              data={resolved_inputs ?? call.inputs}
              label={resolved_inputs != null ? "Inputs (resolved)" : "Inputs"}
              field_descriptions={input_descriptions}
            />
          )}
        </div>
        <div className="min-w-0">
          {call.state === "finished" && call.outputs != null ? (
            on_update_call != null && run_id != null ? (
              <EditableJsonBlock
                data={call.outputs}
                label="Outputs"
                field_descriptions={output_descriptions}
                on_save={(new_data) => on_update_call(run_id, call.id, { outputs: new_data })}
              />
            ) : (
              <JsonBlock data={call.outputs} label="Outputs" field_descriptions={output_descriptions} />
            )
          ) : call.state === "error" && call.error_message != null ? (
            <JsonBlock data={call.error_message} label="Error" is_error />
          ) : (
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 px-4 py-8 text-center text-sm text-zinc-500">
              —
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
