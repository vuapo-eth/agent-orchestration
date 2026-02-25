import type { Agent } from "@/types/agent";
import type { AgentDoc } from "@/types/orchestrator";
import { openai_json } from "@/lib/openai";

type ValidatorInput = {
  agent_input: Record<string, unknown>;
  agent_output: unknown;
  agent_definition: AgentDoc;
  execution_error?: string;
};

type ValidatorOutput = {
  is_success: boolean;
  error_message?: string;
};

function format_agent_definition(doc: AgentDoc): string {
  const args_str = doc.args
    .map((a) => `- ${a.name} (${a.format}): ${a.purpose}`)
    .join("\n");
  const outputs_str = Object.entries(doc.output_schema)
    .map(([k, v]) => `- ${k} (${v.type}): ${v.description}`)
    .join("\n");
  return `Name: ${doc.name}\nPurpose: ${doc.purpose}\nArgs:\n${args_str}\nOutput schema:\n${outputs_str}`;
}

function validate_parsed(parsed: unknown): asserts parsed is ValidatorOutput {
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Validator response must be a JSON object");
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.is_success !== "boolean") {
    throw new Error("Validator response must have boolean is_success");
  }
  if ("error_message" in obj && obj.error_message != null && typeof obj.error_message !== "string") {
    throw new Error("Validator response error_message must be a string when present");
  }
}

export const validator_agent: Agent<ValidatorInput, ValidatorOutput> = {
  name: "Execution validator",
  purpose:
    "Given the full input, full output (or absence thereof), and the agent definition, determines whether the agent execution was successful or produced an error. Use when execution_error is set, or when output is missing/invalid relative to the agent's output schema and purpose.",
  action_label: "Validating result",
  args: [
    {
      name: "agent_input",
      format: "object",
      purpose: "The exact input (args) that was passed to the agent call.",
    },
    {
      name: "agent_output",
      format: "any (JSON-serializable or null)",
      purpose: "The result returned by the agent, or null/undefined if the call threw.",
    },
    {
      name: "agent_definition",
      format: "AgentDoc",
      purpose: "The agent's definition (name, purpose, args, output_schema).",
    },
    {
      name: "execution_error",
      format: "string (optional)",
      purpose: "If the agent call threw an error, the error message. Omit when the call succeeded.",
    },
  ],
  output_schema: {
    is_success: {
      description: "True if the execution completed successfully and the output is valid; false otherwise.",
      type: "boolean",
    },
    error_message: {
      description: "When is_success is false, a short explanation of what went wrong.",
      type: "string",
    },
  },
  execute: async ({ agent_input, agent_output, agent_definition, execution_error }) => {
    const definition_text = format_agent_definition(agent_definition);
    const has_error = Boolean(execution_error?.trim());
    const user_content = has_error
      ? `The agent call threw an error.\n\nAgent definition:\n${definition_text}\n\nInput:\n${JSON.stringify(agent_input, null, 2)}\n\nExecution error: ${execution_error}\n\nOutput (if any): ${agent_output == null ? "none" : JSON.stringify(agent_output, null, 2)}`
      : `Agent definition:\n${definition_text}\n\nInput:\n${JSON.stringify(agent_input, null, 2)}\n\nOutput:\n${agent_output == null ? "null" : JSON.stringify(agent_output, null, 2)}`;

    const system_content = `You are an execution validator. Given an agent's definition, the input that was passed to it, and the output (or an execution error), you must decide whether the execution was successful.

Rules:
- If execution_error is provided, the execution failed: set is_success to false and set error_message to a brief summary of the error.
- If there is no execution_error, check that the output is present and matches the agent's output_schema (same keys, compatible types). If the output is null/undefined when it should be an object, or if required output fields are missing or wrong type, set is_success to false and describe what is wrong in error_message.
- If the output is valid and complete according to the schema and the agent's purpose, set is_success to true. You may omit error_message when is_success is true.

Respond with a single JSON object: { "is_success": boolean, "error_message"?: string }. No markdown, no explanation outside the JSON.`;

    return openai_json<ValidatorOutput>({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: system_content },
        { role: "user", content: user_content },
      ],
      temperature: 0.1,
      validate: validate_parsed,
    });
  },
};
