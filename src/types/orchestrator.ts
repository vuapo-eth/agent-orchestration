import type { AgentArg, AgentOutputField } from "@/types/agent";

export type AgentDoc = {
  name: string;
  purpose: string;
  args: AgentArg[];
  output_schema: Record<string, AgentOutputField>;
};

export type InputRef = {
  ref: string;
};

export type PlanStepInputValue = unknown | InputRef;

export type OrchestratorCall = {
  id: string;
  agent_name: string;
  inputs: Record<string, PlanStepInputValue>;
};

export type OrchestratorPlan = {
  calls: OrchestratorCall[];
};

export function is_input_ref(value: PlanStepInputValue): value is InputRef {
  return typeof value === "object" && value !== null && "ref" in value && typeof (value as InputRef).ref === "string";
}
