import type { ThumbReaction } from "@app/components/assistant/conversation/FeedbackSelector";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import type {
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";

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

// Billing slice of the consumption unit. USAGE_TYPE_FREE is deliberately absent:
// the index holds billed consumption only, so free calls are never indexed.
export type AgentMessageConsumptionAnalyticsUsageType =
  | typeof USAGE_TYPE_USER
  | typeof USAGE_TYPE_PROGRAMMATIC;

export interface AgentMessageConsumptionAnalyticsAgent {
  // Agent used for analytics grouping. Hidden helpers are attributed to their
  // immediate parent. Every other agent is attributed to itself.
  attributed_id: string;
  // Agent that executed the message. Kept distinct from `attributed_id` so the
  // underlying execution remains inspectable.
  id: string;
  version: string;
  tag_ids: string[];
  // IDs of the agent's ancestors, from the top-level agent down to the immediate parent. Empty for a top-level agent.
  parent_ids: string[];
  // The immediate parent of the agent. Null for a top-level agent.
  direct_parent_id: string | null;
  // The top-level agent of the run. Equals `id` when this agent is itself the root.
  root_id: string;
  // 0 for a top-level agent, incremented once per level of sub-agent nesting.
  depth: number;
}

export interface AgentMessageConsumptionAnalyticsUser {
  id: string;
  // Group sIds the user belonged to when the message completed.
  group_ids: string[];
}

export interface AgentMessageConsumptionAnalyticsTool {
  name: string;
  server_name: string;
  // Server that called this tool. Empty when the agent called this tool directly.
  parent_server_name: string;
  action_id: string;
  // Every skill that can be held responsible, directly or indirectly, for this
  // tool call being made.
  // When a tool call enables a skill, that skill is also reflected here.
  attributed_skill_ids: string[];
}

type AgentMessageConsumptionAnalyticsTokens = {
  system: number;
  input: number | null;
  result_footprint: number | null;
  output: number;
  reasoning: number;
};

export type AgentMessageConsumptionAnalyticsLlmTokens =
  AgentMessageConsumptionAnalyticsTokens & {
    // System prompt tokens when measured separately. Otherwise included in `input`.
    system: number;
    // Provider prompt tokens not split into `system`.
    input: number;
    // Tool result footprints are carried by tool documents.
    result_footprint: null;
    // Assistant output tokens after reasoning and tool calls are removed.
    output: number;
    // Provider-reported reasoning tokens.
    reasoning: number;
  };

export type AgentMessageConsumptionAnalyticsToolTokens =
  AgentMessageConsumptionAnalyticsTokens & {
    // Tool documents do not carry system prompt tokens.
    system: 0;
    // Provider prompt tokens are carried by LLM documents.
    input: null;
    // Estimated tokens added to model context by the tool result. Not additive with LLM input.
    result_footprint: number;
    // Model output tokens used to emit the tool name and arguments.
    output: number;
    // Tool documents do not carry reasoning tokens.
    reasoning: 0;
  };

type AgentMessageConsumptionAnalyticsGrossCreditMicro = {
  system: number;
  input: number | null;
  result_footprint: number | null;
  output: number | null;
  reasoning: number;
  direct: number;
  total: number;
};

export type AgentMessageConsumptionAnalyticsLlmGrossCreditMicro =
  AgentMessageConsumptionAnalyticsGrossCreditMicro & {
    // Credit attributed to system prompt tokens.
    system: number;
    // Reconciled credit attributed to the remaining provider prompt tokens.
    input: number;
    // Tool result footprint credit is carried by tool documents.
    result_footprint: null;
    // Credit attributed to assistant output tokens.
    output: number;
    // Credit attributed to provider-reported reasoning tokens.
    reasoning: number;
    // LLM documents do not carry direct tool charges.
    direct: 0;
    // Total credit attributed to this LLM run. Equals `credit_micro`.
    total: number;
  };

export type AgentMessageConsumptionAnalyticsToolGrossCreditMicro =
  AgentMessageConsumptionAnalyticsGrossCreditMicro & {
    // Tool documents do not carry system prompt credit.
    system: 0;
    // The tool model-input credit split is not persisted yet.
    input: null;
    // The tool result footprint credit split is not persisted yet.
    result_footprint: null;
    // The emitted tool call credit split is not persisted yet.
    output: null;
    // Tool documents do not carry reasoning credit.
    reasoning: 0;
    // Direct charge for executing the tool.
    direct: number;
    // Full credit attributed to this tool call. Equals `credit_micro`.
    total: number;
  };

interface AgentMessageConsumptionAnalyticsBaseData
  extends ElasticsearchBaseDocument {
  agent: AgentMessageConsumptionAnalyticsAgent;
  agent_message_id: string;
  api_key_name: string | null;
  // Version of the attribution logic that produced this document.
  attribution_version: number;
  completed_at: string; // ISO date string.
  // Idempotency key.
  consumption_key: string;
  context_origin: UserMessageOrigin | null;
  // `context_origin` with its programmatic variants folded into the surface they
  // belong to. This is the source analytics groups and filters on.
  normalized_origin: UserMessageOrigin | null;
  conversation_id: string;
  // Normalized cost attributed to this consumption unit. Tool documents include the model output
  // used to emit the call, the result footprint, and the direct tool charge. LLM documents carry
  // the remaining model cost. The sum over one message reconciles exactly to its authoritative
  // billed cost.
  credit_micro: number;
  execution_time_ms: number | null;
  message_version: string;
  parent_message_id: string | null;
  model: AgentMessageAnalyticsModel | null;
  run_usage_id: string;
  space_id: string | null;
  status: string;
  step_index: number;
  trigger_id: string | null;
  usage_type: AgentMessageConsumptionAnalyticsUsageType;
  user: AgentMessageConsumptionAnalyticsUser | null;
  workspace_id: string;
}

export interface AgentMessageConsumptionAnalyticsLlmData
  extends AgentMessageConsumptionAnalyticsBaseData {
  consumption_type: "llm";
  gross_credit_micro: AgentMessageConsumptionAnalyticsLlmGrossCreditMicro;
  tokens: AgentMessageConsumptionAnalyticsLlmTokens;
  tool: null;
}

export interface AgentMessageConsumptionAnalyticsToolData
  extends AgentMessageConsumptionAnalyticsBaseData {
  consumption_type: "tool";
  gross_credit_micro: AgentMessageConsumptionAnalyticsToolGrossCreditMicro;
  tokens: AgentMessageConsumptionAnalyticsToolTokens;
  tool: AgentMessageConsumptionAnalyticsTool;
}

export type AgentMessageConsumptionAnalyticsData =
  | AgentMessageConsumptionAnalyticsLlmData
  | AgentMessageConsumptionAnalyticsToolData;

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
