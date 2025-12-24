import type { ThumbReaction } from "@app/components/assistant/conversation/FeedbackSelector";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type { AgentMessageStatus, UserMessageOrigin } from "@app/types";

/**
 * Types for agent analytics data stored in Elasticsearch
 */

export interface AgentMessageAnalyticsTokens {
  prompt: number;
  completion: number;
  reasoning: number;
  cached: number;
  cost_micro_usd: number;
}

export interface AgentMessageAnalyticsToolUsed {
  step_index: number;
  server_name: string;
  tool_name: string;
  mcp_server_configuration_sid?: string;
  execution_time_ms: number | null;
  status: string;
}

export interface AgentMessageAnalyticsFeedback {
  feedback_id: number;
  user_id: string;
  thumb_direction: ThumbReaction;
  content?: string;
  is_conversation_shared: boolean;
  dismissed: boolean;
  created_at: string; // ISO date string.
}

export interface AgentMessageAnalyticsData extends ElasticsearchBaseDocument {
  agent_id: string;
  agent_version: string;
  conversation_id: string;
  feedbacks: AgentMessageAnalyticsFeedback[];
  context_origin: UserMessageOrigin | null;
  latency_ms: number;
  message_id: string;
  status: AgentMessageStatus;
  timestamp: string; // ISO date string.
  tokens: AgentMessageAnalyticsTokens;
  tools_used: AgentMessageAnalyticsToolUsed[];
  user_id: string;
  version: string;
  workspace_id: string;
}

export interface AgentRetrievalOutputAnalyticsData extends ElasticsearchBaseDocument {
  message_id: string;
  workspace_id: string;
  conversation_id: string;
  agent_id: string;
  agent_version: string;
  timestamp: string; // ISO date string.
  mcp_server_configuration_id: string;
  mcp_server_name: string;
  data_source_view_id: string;
  data_source_id: string;
  data_source_name: string;
  document_id: string;
}
