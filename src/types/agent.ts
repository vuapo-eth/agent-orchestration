export type AgentArg = {
  name: string;
  format: string;
  purpose: string;
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
  execute: (args: TArgs) => Promise<TOutput>;
};
