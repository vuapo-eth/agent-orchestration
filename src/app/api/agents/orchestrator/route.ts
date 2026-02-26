import { NextResponse } from "next/server";
import { IMPLEMENTED_AGENTS, orchestrator_agent, agent_to_doc, execute_orchestrator_regenerate } from "@/lib/agents";
import type { AgentDoc, OrchestratorPlan } from "@/types/orchestrator";

const DEFAULT_AGENT_DOCS: AgentDoc[] = IMPLEMENTED_AGENTS.filter(
  (a) => a.name !== orchestrator_agent.name
).map(agent_to_doc);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      task,
      agent_docs,
      current_architecture,
      execution_history,
    } = body as {
      task?: string;
      agent_docs?: AgentDoc[];
      current_architecture?: OrchestratorPlan;
      execution_history?: Array<{
        call_id: string;
        agent_name: string;
        state: string;
        inputs?: Record<string, unknown>;
        outputs?: Record<string, unknown>;
        error_message?: string;
      }>;
    };
    if (typeof task !== "string" || !task.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'task' (string)" },
        { status: 400 }
      );
    }
    const docs = Array.isArray(agent_docs) && agent_docs.length > 0 ? agent_docs : DEFAULT_AGENT_DOCS;
    if (
      current_architecture != null &&
      execution_history != null &&
      Array.isArray(execution_history)
    ) {
      const out = await execute_orchestrator_regenerate({
        task: task.trim(),
        agent_docs: docs,
        current_plan: current_architecture,
        execution_history,
      });
      return NextResponse.json(out);
    }
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
