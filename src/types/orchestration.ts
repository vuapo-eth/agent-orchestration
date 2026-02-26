export type AgentCallState = "queued" | "ready" | "running" | "finished" | "error";

export type AgentCall = {
  id: string;
  agent_name: string;
  state: AgentCallState;
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error_message?: string;
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
};
