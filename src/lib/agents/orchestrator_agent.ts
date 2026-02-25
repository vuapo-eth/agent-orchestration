import type { Agent } from "@/types/agent";
import type { AgentDoc, OrchestratorPlan } from "@/types/orchestrator";
import { get_ref_call_id } from "@/utils/refs";
import { openai_json } from "@/lib/openai";

const REF_PATTERN = /^[a-zA-Z0-9_-]+\.(outputs|inputs|agent_definition)(\..*|$)/;
const CALL_ID_PATTERN = /^call_\d+$/;

function is_ref_object(v: unknown): v is { ref: string } {
  return (
    v != null &&
    typeof v === "object" &&
    "ref" in v &&
    typeof (v as { ref: string }).ref === "string"
  );
}

function get_ref_string(v: unknown): string | null {
  if (is_ref_object(v)) return v.ref;
  if (typeof v === "string" && REF_PATTERN.test(v)) return v;
  return null;
}

function verify_orchestrator_plan(
  parsed: unknown,
  allowed_agent_names: string[]
): asserts parsed is OrchestratorPlan {
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Orchestrator plan must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  if (!("calls" in obj)) {
    throw new Error("Orchestrator plan must have a 'calls' property");
  }
  if (!Array.isArray(obj.calls)) {
    throw new Error("Orchestrator plan 'calls' must be an array");
  }
  const allowed_set = new Set(allowed_agent_names);
  const call_ids = new Set<string>();
  for (let i = 0; i < obj.calls.length; i++) {
    const call = obj.calls[i];
    if (call == null || typeof call !== "object" || Array.isArray(call)) {
      throw new Error(`Orchestrator plan calls[${i}] must be an object`);
    }
    const c = call as Record<string, unknown>;
    if (typeof c.id !== "string" || !c.id.trim()) {
      throw new Error(`Orchestrator plan calls[${i}] must have a non-empty string "id"`);
    }
    if (typeof c.agent_name !== "string" || !c.agent_name.trim()) {
      throw new Error(`Orchestrator plan calls[${i}] must have a non-empty string "agent_name"`);
    }
    if (!allowed_set.has(c.agent_name)) {
      throw new Error(
        `Orchestrator plan calls[${i}] agent_name "${c.agent_name}" is not in the allowed list: ${allowed_agent_names.join(", ")}`
      );
    }
    if (call_ids.has(c.id as string)) {
      throw new Error(`Orchestrator plan duplicate call id "${c.id}"`);
    }
    if (!CALL_ID_PATTERN.test(c.id as string)) {
      throw new Error(
        `Orchestrator plan calls[${i}] id must be "call_1", "call_2", "call_3", etc. (got "${c.id}")`
      );
    }
    call_ids.add(c.id as string);
    if (c.inputs == null || typeof c.inputs !== "object" || Array.isArray(c.inputs)) {
      throw new Error(`Orchestrator plan calls[${i}] must have "inputs" as an object`);
    }
  }
  const sorted_ids = [...call_ids].sort((a, b) => {
    const n_a = parseInt(a.replace("call_", ""), 10);
    const n_b = parseInt(b.replace("call_", ""), 10);
    return n_a - n_b;
  });
  for (let k = 0; k < sorted_ids.length; k++) {
    const expected = `call_${k + 1}`;
    if (sorted_ids[k] !== expected) {
      throw new Error(
        `Orchestrator plan call ids must be call_1, call_2, ... call_${sorted_ids.length} with no gaps (found ${sorted_ids.join(", ")})`
      );
    }
  }
  for (let i = 0; i < obj.calls.length; i++) {
    const c = obj.calls[i] as Record<string, unknown>;
    const inputs = c.inputs as Record<string, unknown>;
    for (const [key, val] of Object.entries(inputs)) {
      const ref = get_ref_string(val);
      if (ref != null) {
        const ref_call_id = get_ref_call_id(ref);
        if (!CALL_ID_PATTERN.test(ref_call_id)) {
          throw new Error(
            `Orchestrator plan calls[${i}] inputs.${key} ref must reference a call id like "call_1", "call_2" (got "${ref_call_id}")`
          );
        }
        if (!call_ids.has(ref_call_id)) {
          throw new Error(
            `Orchestrator plan calls[${i}] inputs.${key} references "${ref_call_id}" which is not a call id in this plan. Call ids: ${[...call_ids].join(", ")}`
          );
        }
        if (!REF_PATTERN.test(ref)) {
          throw new Error(
            `Orchestrator plan calls[${i}] inputs.${key} ref must match "call_id.outputs", "call_id.outputs.field", "call_id.inputs", "call_id.inputs.field", or "call_id.agent_definition"`
          );
        }
      }
    }
  }
}

export function agent_to_doc<TArgs extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
  agent: Agent<TArgs, TOutput>
): AgentDoc {
  return {
    name: agent.name,
    purpose: agent.purpose,
    args: agent.args,
    output_schema: agent.output_schema,
    ...(agent.action_label != null ? { action_label: agent.action_label } : {}),
  };
}

function format_agents_for_prompt(agents: AgentDoc[]): string {
  return agents
    .map(
      (a, i) =>
        `## ${a.name}\nPurpose: ${a.purpose}\nArgs:\n${a.args.map((arg) => `- ${arg.name} (${arg.format}): ${arg.purpose}`).join("\n")}\nOutputs:\n${Object.entries(a.output_schema)
          .map(([k, v]) => `- ${k} (${v.type}): ${v.description}`)
          .join("\n")}`
    )
    .join("\n\n");
}

const OUTPUT_FORMAT = `You must respond with a single JSON object of this shape (no markdown, no explanation):
{
  "calls": [
    {
      "id": "call_1",
      "agent_name": "<exact name from the list>",
      "inputs": {
        "<arg_name>": <literal value or {"ref": "call_N.outputs.field"} or {"ref": "call_N.inputs"} or {"ref": "call_N.inputs.field"} or {"ref": "call_N.agent_definition"}>
      }
    }
  ]
}
- Call ids must be exactly "call_1", "call_2", "call_3", ... in dependency order (no dependencies first, then their dependents). Use these ids and no other names.
- Prefer referencing specific output fields: use {"ref": "call_N.outputs.field_name"} (e.g. call_1.outputs.results, call_1.outputs.sql) so the downstream agent receives only the fields it needs. Use {"ref": "call_N.outputs"} only when the downstream agent truly needs the full outputs object.
- To reference another call's inputs (e.g. for validation), use {"ref": "call_N.inputs"} or {"ref": "call_N.inputs.field_name"}.
- To reference the agent definition used in another call, use {"ref": "call_N.agent_definition"}.
- For literal values, pass them directly.`;

const SYSTEM_PROMPT = `You are a task planner. Given a task and a list of available agents, output a strict JSON plan: a set of agent calls (a DAG).

CRITICAL: Each call's "id" must be exactly "call_1", "call_2", "call_3", etc. in dependency order: put steps with no dependencies first (call_1, call_2, ...), then steps that depend on them. In "inputs" prefer specific output refs: use {"ref": "call_N.outputs.field_name"} (e.g. call_1.outputs.results, call_1.outputs.sql) rather than {"ref": "call_N.outputs"} so downstream agents receive the exact fields they need. You may also use {"ref": "call_N.inputs"} or {"ref": "call_N.inputs.field"} for inputs; {"ref": "call_N.agent_definition"} for the agent definition. Do not use custom names like "fetch_data" or "step_1"—only "call_1", "call_2", "call_3".

Each call has "agent_name" (exact name from the list) and "inputs". Only use agents from the list. Keep the plan minimal and feasible.

${OUTPUT_FORMAT}`;

export const orchestrator_agent: Agent<
  { task: string; agent_docs: AgentDoc[] },
  OrchestratorPlan
> = {
  name: "Orchestrator",
  purpose:
    "Given a human-readable task and documentation for available agents, produces a set of agent calls (a DAG). Each call has a unique id and inputs; inputs can be literals or refs to another call's output (e.g. {\"ref\": \"fetch_data.outputs.results\"}). Execution order is implied by the dependency graph.",
  args: [
    {
      name: "task",
      format: "string",
      purpose: "The task to accomplish in natural language.",
    },
    {
      name: "agent_docs",
      format: "array of AgentDoc (name, purpose, args, output_schema)",
      purpose: "Documentation for each available agent (name, purpose, args, output_schema).",
    },
  ],
  output_schema: {
    calls: {
      description: "Set of agent calls. Each has id, agent_name, and inputs; input values can be literals or { ref: 'call_id.outputs.field' }. Refs form a DAG.",
      type: "array",
    },
  },
  execute: async ({ task, agent_docs }) => {
    const agents_text = format_agents_for_prompt(agent_docs);
    const allowed_names = agent_docs.map((d) => d.name);
    return openai_json<OrchestratorPlan>({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: `${SYSTEM_PROMPT}`,
        },
        {
          role: "user",
          content: `Task: ${task}\n\nAvailable agents:\n\n${agents_text}`,
        },
      ],
      temperature: 0.2,
      validate: (parsed) => verify_orchestrator_plan(parsed, allowed_names),
    });
  },
};
