import type { ThumbReaction } from "@app/components/assistant/conversation/FeedbackSelector";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type { AgentMessageType } from "@app/types";

/**
 * Types for agent analytics data stored in Elasticsearch
 */

export interface AgentMessageAnalyticsTokens {
  prompt: number;
  completion: number;
  reasoning: number;
  cached: number;
  cost_cents: number;
}

export interface AgentMessageAnalyticsToolUsed {
  step_index: number;
  server_name: string;
  tool_name: string;
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
  latency_ms: number;
  message_id: string;
  status: AgentMessageType["status"];
  timestamp: string; // ISO date string.
  tokens: AgentMessageAnalyticsTokens;
  tools_used: AgentMessageAnalyticsToolUsed[];
  feedbacks: AgentMessageAnalyticsFeedback[];
  user_id: string;
  workspace_id: string;
  content: string | null;
}
