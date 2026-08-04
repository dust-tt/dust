import type { ThumbReaction } from "@app/components/assistant/conversation/FeedbackSelector";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";

import type { AgentMessageStatus, UserMessageOrigin } from "./conversation";
import type { ConversationSkillOrigin } from "./conversation_skills";
import type {
  ModelIdType,
  ModelProviderIdType,
  ModelResolutionMethodType,
  ReasoningEffort,
} from "./models/types";

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
  billable_awu: number;
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

export interface AgentMessageAnalyticsModel {
  provider_id: ModelProviderIdType;
  model_id: ModelIdType;
  reasoning_effort: ReasoningEffort;
  resolution_method: ModelResolutionMethodType | null;
}

export interface AgentMessageAnalyticsData extends ElasticsearchBaseDocument {
  agent_id: string;
  agent_version: string;
  // Tag sIds attached to the agent configuration version that produced this
  // message, captured at index time (reflects the agent's tags at message time).
  agent_tag_ids: string[];
  model: AgentMessageAnalyticsModel | null;
  ancestor_message_ids: string[];
  conversation_id: string;
  // sId of the space the conversation lives in (any kind), null when the
  // conversation is not attached to a space.
  space_id: string | null;
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

/**
 * Types for consumption documents stored in Elasticsearch. One document per unit
 * of credit consumption attributed to an agent message (an LLM call for one step,
 * or a single tool call), as opposed to AgentMessageAnalyticsData which holds
 * one aggregated document per message.
 */

// The 5 item types of the agent_message_consumption_items table collapse to 2
// here: the model token buckets (system, input, output, reasoning) become one
// "llm" document whose buckets are carried by `tokens` and `gross_credit_micro`.
export type AgentMessageConsumptionAnalyticsType = "llm" | "tool";

export interface AgentMessageConsumptionAnalyticsAgent {
  id: string;
  version: string;
  tag_ids: string[];
  // Agent that started the run; equals `id` for a top-level agent.
  root_agent_id: string;
  // 0 for a top-level agent, incremented once per level of sub-agent nesting.
  depth: number;
}

export interface AgentMessageConsumptionAnalyticsUser {
  id: string;
}

export interface AgentMessageConsumptionAnalyticsTool {
  name: string;
  server_name: string;
  action_id: string;
  // Skills that made this tool available to the agent.
  enabled_by_skill_ids: string[];
}

export interface AgentMessageConsumptionAnalyticsTokens {
  system: number;
  input: number;
  // Tool documents only: tokens the tool result adds to the conversation. Cannot
  // be summed with `input`, which counts the tokens the LLM consumed itself.
  result_footprint: number | null;
  output: number;
  reasoning: number;
}

export interface AgentMessageConsumptionAnalyticsGrossCreditMicro {
  system: number;
  input: number;
  // Tool documents only, see AgentMessageConsumptionAnalyticsTokens.result_footprint.
  result_footprint: number | null;
  output: number;
  reasoning: number;
  direct: number;
  total: number;
}

export interface AgentMessageConsumptionAnalyticsData
  extends ElasticsearchBaseDocument {
  agent: AgentMessageConsumptionAnalyticsAgent;
  agent_message_id: string;
  api_key_name: string | null;
  // Version of the attribution logic that produced this document.
  attribution_version: number;
  // Idempotency key.
  consumption_key: string;
  consumption_type: AgentMessageConsumptionAnalyticsType;
  conversation_id: string;
  credit_micro: number;
  execution_time_ms: number | null;
  gross_credit_micro: AgentMessageConsumptionAnalyticsGrossCreditMicro;
  is_billed: boolean;
  message_version: string;
  model: AgentMessageAnalyticsModel | null;
  run_usage_id: string;
  source: string;
  space_id: string | null;
  status: string;
  step_index: number;
  timestamp: string; // ISO date string.
  tokens: AgentMessageConsumptionAnalyticsTokens;
  tool: AgentMessageConsumptionAnalyticsTool | null;
  user: AgentMessageConsumptionAnalyticsUser | null;
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
