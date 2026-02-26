import { NextResponse } from "next/server";
import { validator_agent } from "@/lib/agents/validator_agent";
import type { AgentDoc } from "@/types/orchestrator";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      agent_input?: Record<string, unknown>;
      agent_output?: unknown;
      agent_definition?: AgentDoc;
      execution_error?: string;
      custom_prompt?: string;
    };
    const { agent_input, agent_output, agent_definition, execution_error, custom_prompt } = body;
    if (agent_input == null || typeof agent_input !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid 'agent_input' (object)" },
        { status: 400 }
      );
    }
    if (agent_definition == null || typeof agent_definition !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid 'agent_definition' (object)" },
        { status: 400 }
      );
    }
    const out = await validator_agent.execute({
      agent_input,
      agent_output: agent_output ?? null,
      agent_definition,
      execution_error: typeof execution_error === "string" ? execution_error : undefined,
      custom_prompt: typeof custom_prompt === "string" && custom_prompt.trim() !== "" ? custom_prompt.trim() : undefined,
    });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
