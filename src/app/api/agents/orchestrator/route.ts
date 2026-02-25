import { NextResponse } from "next/server";
import { IMPLEMENTED_AGENTS, orchestrator_agent, agent_to_doc } from "@/lib/agents";
import type { AgentDoc } from "@/types/orchestrator";

const DEFAULT_AGENT_DOCS: AgentDoc[] = IMPLEMENTED_AGENTS.filter(
  (a) => a.name !== orchestrator_agent.name
).map(agent_to_doc);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { task, agent_docs } = body as { task?: string; agent_docs?: AgentDoc[] };
    if (typeof task !== "string" || !task.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'task' (string)" },
        { status: 400 }
      );
    }
    const docs = Array.isArray(agent_docs) && agent_docs.length > 0 ? agent_docs : DEFAULT_AGENT_DOCS;
    const out = await orchestrator_agent.execute({
      task: task.trim(),
      agent_docs: docs,
    });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
