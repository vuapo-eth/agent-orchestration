import type { Agent } from "@/types/agent";
import type { AgentDoc, OrchestratorPlan } from "@/types/orchestrator";
import { get_openai_client } from "@/lib/openai";

const REF_PATTERN = /^[a-zA-Z0-9_-]+\.outputs(\.|$)/;

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
    call_ids.add(c.id as string);
    if (c.inputs == null || typeof c.inputs !== "object" || Array.isArray(c.inputs)) {
      throw new Error(`Orchestrator plan calls[${i}] must have "inputs" as an object`);
    }
  }
  for (let i = 0; i < obj.calls.length; i++) {
    const c = obj.calls[i] as Record<string, unknown>;
    const inputs = c.inputs as Record<string, unknown>;
    for (const [key, val] of Object.entries(inputs)) {
      const ref = get_ref_string(val);
      if (ref != null) {
        const ref_call_id = ref.includes(".outputs") ? ref.slice(0, ref.indexOf(".outputs")) : ref;
        if (!call_ids.has(ref_call_id)) {
          throw new Error(
            `Orchestrator plan calls[${i}] inputs.${key} references "${ref_call_id}" which is not a call id in this plan. Call ids: ${[...call_ids].join(", ")}`
          );
        }
        if (!REF_PATTERN.test(ref)) {
          throw new Error(
            `Orchestrator plan calls[${i}] inputs.${key} ref must match "call_id.outputs" or "call_id.outputs.field"`
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
      "id": "<unique_id>",
      "agent_name": "<exact name from the list>",
      "inputs": {
        "<arg_name>": <literal value or {"ref": "call_id.outputs.field"}>
      }
    }
  ]
}
- "calls" is a set of agent calls (order does not matter). The input/output refs form a DAG: execution order is determined by dependencies.
- Each call has a unique "id" (e.g. "fetch_data", "summarize"). To reference another call's output, use {"ref": "that_call_id.outputs.field_name"}.
- For literal values, pass them directly.`;

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
    const openai = get_openai_client();
    const agents_text = format_agents_for_prompt(agent_docs);
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: `You are a task planner. Given a task and a list of available agents, output a strict JSON plan: a set of agent calls (a DAG). Each call has a unique string "id", an "agent_name" from the list, and "inputs". To pass data from one call to another, use {"ref": "call_id.outputs.field_name"} in the dependent call's inputs. The refs define the dependency graph; order of the "calls" array does not matter. Only use agents from the list. Keep the plan minimal and feasible.\n\n${OUTPUT_FORMAT}`,
        },
        {
          role: "user",
          content: `Task: ${task}\n\nAvailable agents:\n\n${agents_text}`,
        },
      ],
      temperature: 0.2,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const cleaned = raw.replace(/^```\w*\n?|\n?```$/g, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`Orchestrator returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
    const allowed_names = agent_docs.map((d) => d.name);
    verify_orchestrator_plan(parsed, allowed_names);
    return parsed;
  },
};
