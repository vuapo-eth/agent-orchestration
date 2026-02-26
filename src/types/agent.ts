export type AgentArg = {
  name: string;
  format: string;
  purpose: string;
  optional?: boolean;
};

export type AgentOutputField = {
  description: string;
  type: string;
};

export type Agent<TArgs extends Record<string, unknown> = Record<string, unknown>, TOutput extends Record<string, unknown> = Record<string, unknown>> = {
  name: string;
  purpose: string;
  args: AgentArg[];
  output_schema: Record<string, AgentOutputField>;
  action_label?: string;
  orchestrator_usage?: string;
  execute: (args: TArgs) => Promise<TOutput>;
};
