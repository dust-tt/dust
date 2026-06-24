import type { ThumbReaction } from "@app/components/assistant/conversation/FeedbackSelector";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";

import type { AgentMessageStatus, UserMessageOrigin } from "./conversation";
import type { ConversationSkillOrigin } from "./conversation_skills";

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
  cost_awu: number;
}

export interface AgentMessageAnalyticsCost {
  full_awu: number;
  llm_awu: number;
  tool_awu: number;
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

export interface AgentMessageAnalyticsSkillUsed {
  skill_id: string;
  skill_name: string;
  skill_type: "custom" | "global";
  source: ConversationSkillOrigin;
}

export interface AgentMessageAnalyticsData extends ElasticsearchBaseDocument {
  agent_id: string;
  agent_version: string;
  ancestor_message_ids: string[];
  conversation_id: string;
  cost: AgentMessageAnalyticsCost;
  feedbacks: AgentMessageAnalyticsFeedback[];
  context_origin: UserMessageOrigin | null;
  latency_ms: number;
  message_id: string;
  skills_used: AgentMessageAnalyticsSkillUsed[];
  status: AgentMessageStatus;
  is_free_seat: boolean;
  timestamp: string; // ISO date string.
  tokens: AgentMessageAnalyticsTokens;
  tools_used: AgentMessageAnalyticsToolUsed[];
  user_id: string;
  version: string;
  workspace_id: string;
}

export interface AgentRetrievalOutputAnalyticsData
  extends ElasticsearchBaseDocument {
  message_id: string;
  workspace_id: string;
  conversation_id: string;
  agent_id: string;
  agent_version: string;
  timestamp: string; // ISO date string.
  // Optional: not present for internal servers like data_sources_file_system
  // that don't have persistent configurations.
  mcp_server_configuration_id?: number;
  mcp_server_name: string;
  data_source_view_id: string;
  data_source_id: string;
  data_source_name: string;
  document_id: string;
}
