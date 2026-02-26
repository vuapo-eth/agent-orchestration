import { useState } from "react";
import type { AgentCallState } from "@/types/orchestration";
import { CircleDot, Loader2, CheckCircle, XCircle, Play, ToggleLeft, ToggleRight } from "lucide-react";
import { JsonBlock } from "./json_block";
import { EditableJsonBlock } from "./editable_json_block";
import { JsonTree } from "./json_tree";
import { has_refs } from "@/utils/refs";
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

export { STATE_CONFIG as AGENT_CALL_STATE_CONFIG };

export function AgentCallCard({
  call,
  index,
  run_id,
  resolved_inputs,
  queued_reason,
  on_run_agent,
  on_agent_name_click,
  on_update_call,
  hide_header,
  tall_inputs_outputs = false,
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
  queued_reason?: string | null;
  on_run_agent?: (run_id: string, call_id: string) => void;
  on_agent_name_click?: (agent_name: string) => void;
  on_update_call?: (run_id: string, call_id: string, updates: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> }) => void;
  hide_header?: boolean;
  tall_inputs_outputs?: boolean;
}) {
  const config = STATE_CONFIG[call.state];
  const Icon = config.icon;
  const color = get_agent_color(call.agent_name);
  const { input_descriptions, output_descriptions } = get_field_descriptions_for_call(call.agent_name);
  const has_doc = IMPLEMENTED_AGENT_DOCS.some((d) => d.name === call.agent_name);
  const short_id = call.id.includes("-") ? call.id.split("-").slice(2).join("-") || call.id : call.id;
  const is_resolved_available =
    resolved_inputs != null && !has_refs(resolved_inputs);
  const has_raw_refs = has_refs(call.inputs);
  const is_toggleable = is_resolved_available && has_raw_refs;
  const [is_showing_resolved, set_is_showing_resolved] = useState(true);
  const show_resolved = is_resolved_available && is_showing_resolved;
  const inputs_data = show_resolved ? resolved_inputs! : call.inputs;
  const inputs_label = show_resolved ? "Inputs (resolved)" : "Inputs (raw)";

  return (
    <div
      className={
        hide_header
          ? "rounded-xl overflow-hidden bg-zinc-900/50"
          : `rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900/50 shadow-md ${color.border} border-l-4`
      }
    >
      {!hide_header && (
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
            {call.state === "queued" && queued_reason != null && queued_reason !== "" && (
              <span className="text-amber-400/90 font-normal normal-case" title={queued_reason}>
                — {queued_reason}
              </span>
            )}
          </div>
        </div>
    {(call.state === "ready" || call.state === "finished" || call.state === "error" || call.state === "running" || (call.state === "queued" && run_id != null && (queued_reason == null || queued_reason === ""))) &&
     run_id != null &&
     on_run_agent != null && (
          <button
            type="button"
            disabled={call.state === "running"}
            onClick={() => on_run_agent(run_id, call.id)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
            aria-label={call.state === "running" ? "Running" : call.state === "ready" || (call.state === "queued" && (queued_reason == null || queued_reason === "")) ? "Run agent" : "Run again"}
          >
            {call.state === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      )}
      <div className="grid grid-cols-2 gap-5 p-5">
        <div className="min-w-0">
          <InputsBlock
            call={call}
            inputs_data={inputs_data}
            inputs_label={inputs_label}
            input_descriptions={input_descriptions}
            is_toggleable={is_toggleable}
            is_showing_resolved={is_showing_resolved}
            on_toggle={() => set_is_showing_resolved((p) => !p)}
            run_id={run_id}
            on_update_call={on_update_call}
            tall={tall_inputs_outputs}
          />
        </div>
        <div className="min-w-0">
          {call.state === "finished" && call.outputs != null ? (
            on_update_call != null && run_id != null ? (
              <EditableJsonBlock
                data={call.outputs}
                label="Outputs"
                field_descriptions={output_descriptions}
                on_save={(new_data) => on_update_call(run_id, call.id, { outputs: new_data })}
                tall={tall_inputs_outputs}
              />
            ) : (
              <JsonBlock data={call.outputs} label="Outputs" field_descriptions={output_descriptions} tall={tall_inputs_outputs} />
            )
          ) : call.state === "error" && call.error_message != null ? (
            <JsonBlock data={call.error_message} label="Error" is_error tall={tall_inputs_outputs} />
          ) : call.state === "running" ? (
            <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/80 flex flex-col overflow-hidden">
              <div className="shrink-0 px-3 py-1.5 text-xs font-medium bg-zinc-800/80 text-zinc-400 border-b border-zinc-700/60">
                Outputs
              </div>
              <div className="flex flex-1 min-h-[8rem] items-center justify-center">
                <Loader2 className="h-8 w-8 text-amber-400 animate-spin" aria-label="Running" />
              </div>
            </div>
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

function InputsBlock({
  call,
  inputs_data,
  inputs_label,
  input_descriptions,
  is_toggleable,
  is_showing_resolved,
  on_toggle,
  run_id,
  on_update_call,
  tall = false,
}: {
  call: { id: string; inputs: Record<string, unknown> };
  inputs_data: Record<string, unknown>;
  inputs_label: string;
  input_descriptions: Record<string, string>;
  is_toggleable: boolean;
  is_showing_resolved: boolean;
  on_toggle: () => void;
  run_id?: string;
  on_update_call?: (run_id: string, call_id: string, updates: { inputs?: Record<string, unknown> }) => void;
  tall?: boolean;
}) {
  const content_class = tall ? "h-80" : "h-40";
  const toggle_button = is_toggleable ? (
    <button
      type="button"
      onClick={on_toggle}
      className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-cyan-400"
    >
      {is_showing_resolved ? (
        <ToggleRight className="h-3.5 w-3.5" />
      ) : (
        <ToggleLeft className="h-3.5 w-3.5" />
      )}
      {is_showing_resolved ? "show raw" : "show resolved"}
    </button>
  ) : null;

  if (!is_showing_resolved && on_update_call != null && run_id != null) {
    return (
      <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/80 overflow-hidden flex flex-col relative group">
        <div className="shrink-0 px-3 py-1.5 text-xs font-medium bg-zinc-800/80 text-zinc-400 flex items-center justify-between">
          <span className="flex items-center gap-2">{inputs_label}{toggle_button}</span>
        </div>
        <div className={`${content_class} min-h-0 overflow-y-auto border-t border-zinc-700/80 p-3`}>
          <JsonTree
            data={inputs_data}
            field_descriptions={input_descriptions}
            on_save={(new_data) => on_update_call(run_id, call.id, { inputs: new_data as Record<string, unknown> })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/80 overflow-hidden flex flex-col">
      <div className="shrink-0 px-3 py-1.5 text-xs font-medium bg-zinc-800/80 text-zinc-400 flex items-center justify-between">
        <span className="flex items-center gap-2">{inputs_label}{toggle_button}</span>
      </div>
      <div className={`${content_class} min-h-0 overflow-y-auto border-t border-zinc-700/80 p-3`}>
        <JsonTree data={inputs_data} field_descriptions={input_descriptions} />
      </div>
    </div>
  );
}
