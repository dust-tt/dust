/**
 * Types for agent analytics data stored in Elasticsearch
 */

export interface AgentAnalyticsTokens {
  prompt: number;
  completion: number;
  reasoning: number;
  cached: number;
}

export interface AgentAnalyticsToolUsed {
  step_index: number;
  server_name: string;
  tool_name: string;
  execution_time_ms: number;
  status: string;
}

export interface AgentAnalyticsData {
  message_id: string;
  workspace_id: string;
  conversation_id: string;
  agent_id: string;
  agent_version: string;
  user_id: string;
  timestamp: string; // ISO date string
  status: string;
  latency_ms: number;
  tokens: AgentAnalyticsTokens;
  tools_used: AgentAnalyticsToolUsed[];
}