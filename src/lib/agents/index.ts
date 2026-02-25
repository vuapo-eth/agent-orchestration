import { sql_agent } from "./sql_agent";
import { js_processor_agent } from "./js_processor_agent";
import { response_agent } from "./response_agent";
import { orchestrator_agent, agent_to_doc } from "./orchestrator_agent";
import type { Agent } from "@/types/agent";
import type { AgentDoc } from "@/types/orchestrator";

export { sql_agent } from "./sql_agent";
export { js_processor_agent } from "./js_processor_agent";
export { response_agent } from "./response_agent";
export { orchestrator_agent, agent_to_doc } from "./orchestrator_agent";

export const IMPLEMENTED_AGENTS: readonly Agent[] = [
  orchestrator_agent,
  sql_agent,
  js_processor_agent,
  response_agent,
];

export const IMPLEMENTED_AGENT_NAMES = IMPLEMENTED_AGENTS.map((a) => a.name) as readonly string[];

export const IMPLEMENTED_AGENT_DOCS: readonly AgentDoc[] = IMPLEMENTED_AGENTS.map(agent_to_doc);
