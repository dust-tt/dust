import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type { AgentMessageType } from "@app/types";

/**
 * Types for agent analytics data stored in Elasticsearch
 */

export type AgentMessageAnalyticsStatus = "completed" | "failed";

export interface AgentMessageAnalyticsTokens {
  prompt: number;
  completion: number;
  reasoning: number;
  cached: number;
}

export interface AgentMessageAnalyticsToolUsed {
  step_index: number;
  server_name: string;
  tool_name: string;
  execution_time_ms: number;
  status: string;
}

export interface AgentMessageAnalyticsData extends ElasticsearchBaseDocument {
  agent_id: string;
  agent_version: string;
  conversation_id: string;
  latency_ms: number;
  message_id: string;
  status: AgentMessageType["status"];
  timestamp: string; // ISO date string.
  tokens: AgentMessageAnalyticsTokens;
  tools_used: AgentMessageAnalyticsToolUsed[];
  user_id: string;
  workspace_id: string;
}
