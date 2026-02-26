export type AgentCallState = "queued" | "ready" | "running" | "finished" | "error";

export type AgentCall = {
  id: string;
  agent_name: string;
  state: AgentCallState;
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error_message?: string;
  custom_prompt?: string;
};

export type RunTab = {
  id: string;
  label?: string;
  agent_calls: AgentCall[];
  final_response_ref?: string;
  final_output?: string;
  final_error?: string;
  dag_node_positions?: Record<string, { x: number; y: number }>;
};

export type Run = {
  id: string;
  created_at: string;
  initial_task: string;
  agent_calls: AgentCall[];
  final_output?: string;
  final_error?: string;
  final_response_ref?: string;
  dag_node_positions?: Record<string, { x: number; y: number }>;
  tabs?: RunTab[];
  selected_tab_id?: string;
};
