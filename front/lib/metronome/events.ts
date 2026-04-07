import {
  type InternalMCPServerNameType,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { createHash } from "crypto";

import type { MetronomeEvent } from "./types";

const MAX_TRANSACTION_ID_LENGTH = 128;
const MAX_PROPERTY_VALUE_BYTES = 128;

/**
 * If a transaction_id exceeds Metronome's 128-char limit, keep the first
 * (128 - 13) chars as a readable prefix and append a 12-char hash suffix
 * for uniqueness.
 */
function truncateTransactionId(id: string): string {
  if (id.length <= MAX_TRANSACTION_ID_LENGTH) {
    return id;
  }
  const hash = createHash("sha256").update(id).digest("hex").slice(0, 12);
  return `${id.slice(0, MAX_TRANSACTION_ID_LENGTH - 13)}-${hash}`;
}

/**
 * Truncate a string property value to fit Metronome's 256-byte limit.
 */
function truncatePropertyValue(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= MAX_PROPERTY_VALUE_BYTES) {
    return value;
  }
  // Truncate conservatively — slice characters until within byte limit.
  let truncated = value;
  while (Buffer.byteLength(truncated, "utf8") > MAX_PROPERTY_VALUE_BYTES - 3) {
    truncated = truncated.slice(0, truncated.length - 1);
  }
  return truncated + "...";
}

// ---------------------------------------------------------------------------
// Tool category mapping
// ---------------------------------------------------------------------------

type ToolCategory =
  | "retrieval"
  | "deep_research"
  | "reasoning"
  | "connectors"
  | "generation"
  | "agents"
  | "actions"
  | "platform";

// Exhaustive map — TypeScript will error if a new internal MCP server is added
// without being categorized here.
const TOOL_CATEGORY_MAP: Record<InternalMCPServerNameType, ToolCategory> = {
  // Retrieval — searching knowledge bases and data sources.
  search: "retrieval",
  query_tables_v2: "retrieval",
  data_warehouses: "retrieval",
  data_sources_file_system: "retrieval",
  include_data: "retrieval",
  conversation_files: "retrieval",

  // Deep research — web search, browsing, HTTP.
  "web_search_&_browse": "deep_research",
  http_client: "deep_research",

  // Connectors — third-party platform integrations.
  confluence: "connectors",
  databricks: "connectors",
  fathom: "connectors",
  freshservice: "connectors",
  github: "connectors",
  gmail: "connectors",
  google_calendar: "connectors",
  google_drive: "connectors",
  google_sheets: "connectors",
  hubspot: "connectors",
  jira: "connectors",
  luma: "connectors",
  microsoft_drive: "connectors",
  microsoft_excel: "connectors",
  microsoft_teams: "connectors",
  monday: "connectors",
  notion: "connectors",
  openai_usage: "connectors",
  outlook_calendar: "connectors",
  outlook: "connectors",
  productboard: "connectors",
  salesforce: "connectors",
  salesloft: "connectors",
  slab: "connectors",
  slack: "connectors",
  slack_bot: "connectors",
  snowflake: "connectors",
  statuspage: "connectors",
  ukg_ready: "connectors",
  val_town: "connectors",
  vanta: "connectors",
  front: "connectors",
  gong: "connectors",
  zendesk: "connectors",
  ashby: "connectors",

  // Generation — file/image/sound creation.
  file_generation: "generation",
  image_generation: "generation",
  sound_studio: "generation",
  speech_generator: "generation",
  slideshow: "generation",
  interactive_content: "generation",

  // Agents — running other agents, routing, sidekick.
  run_agent: "agents",
  agent_router: "agents",
  agent_sidekick_agent_state: "agents",
  agent_sidekick_context: "agents",
  agent_management: "agents",
  agent_memory: "agents",
  run_dust_app: "agents",

  // Platform — internal utilities, management.
  extract_data: "platform",
  common_utilities: "platform",
  toolsets: "platform",
  user_mentions: "platform",
  missing_action_catcher: "platform",
  primitive_types_debugger: "platform",
  jit_testing: "platform",
  skill_management: "platform",
  schedules_management: "platform",
  project_manager: "platform",
  poke: "platform",
  project_conversation: "platform",
  sandbox: "platform",
  ask_user_question: "platform",
};

export function getToolCategory(
  internalMCPServerName: string | null
): ToolCategory {
  if (
    !internalMCPServerName ||
    !isInternalMCPServerName(internalMCPServerName)
  ) {
    // External MCP servers (user-configured remote servers) or unknown names.
    return "actions";
  }
  return TOOL_CATEGORY_MAP[internalMCPServerName];
}

// ---------------------------------------------------------------------------
// LLM usage events
// ---------------------------------------------------------------------------

/**
 * Build aggregated Metronome llm_usage events for an agent message.
 * Usages are grouped by (providerId, modelId) — one event per model used
 * with aggregated token counts and cost.
 *
 * transaction_id pattern: llm-{workspaceId}-{conversationId}-{agentMessageId}-{runKey}-{providerId}-{modelId}
 */
export function buildLlmUsageEvents({
  workspaceId,
  conversationId,
  userId,
  agentMessageId,
  agentId,
  parentAgentMessageId,
  runKey,
  runUsages,
  origin,
  isProgrammaticUsage,
  authMethod,
  apiKeyName,
  messageStatus,
  isSubAgentMessage,
  timestamp,
}: {
  workspaceId: string;
  conversationId: string;
  userId: string | null;
  agentMessageId: string;
  agentId: string | null;
  parentAgentMessageId: string | null;
  runKey: string;
  runUsages: RunUsageType[];
  origin: UserMessageOrigin;
  isProgrammaticUsage: boolean;
  authMethod: string | null;
  apiKeyName: string | null;
  messageStatus: string;
  isSubAgentMessage: boolean;
  timestamp: string;
}): MetronomeEvent[] {
  // Group by (providerId, modelId).
  const groups = new Map<
    string,
    {
      providerId: string;
      modelId: string;
      promptTokens: number;
      completionTokens: number;
      cachedTokens: number;
      cacheCreationTokens: number;
      costMicroUsd: number;
    }
  >();

  for (const usage of runUsages) {
    const key = `${usage.providerId}|${usage.modelId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.promptTokens += usage.promptTokens;
      existing.completionTokens += usage.completionTokens;
      existing.cachedTokens += usage.cachedTokens ?? 0;
      existing.cacheCreationTokens += usage.cacheCreationTokens ?? 0;
      existing.costMicroUsd += usage.costMicroUsd;
    } else {
      groups.set(key, {
        providerId: usage.providerId,
        modelId: usage.modelId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedTokens: usage.cachedTokens ?? 0,
        cacheCreationTokens: usage.cacheCreationTokens ?? 0,
        costMicroUsd: usage.costMicroUsd,
      });
    }
  }

  return [...groups.values()].map((group) => ({
    transaction_id: `llm-${workspaceId}-${conversationId}-${agentMessageId}-${runKey}-${group.providerId}-${group.modelId}`,
    customer_id: workspaceId,
    event_type: "llm_usage",
    timestamp,
    properties: {
      workspace_id: workspaceId,
      ...(userId ? { user_id: userId } : {}),
      agent_message_id: agentMessageId,
      conversation_id: conversationId,
      ...(agentId ? { agent_id: agentId } : {}),
      ...(parentAgentMessageId
        ? { parent_agent_message_id: parentAgentMessageId }
        : {}),
      provider_id: group.providerId,
      model_id: group.modelId,
      prompt_tokens: group.promptTokens,
      completion_tokens: group.completionTokens,
      cached_tokens: group.cachedTokens,
      cache_creation_tokens: group.cacheCreationTokens,
      // Provider cost without markup — markup is applied in Metronome rate card.
      cost_micro_usd: group.costMicroUsd,
      is_programmatic_usage: isProgrammaticUsage ? "true" : "false",
      ...(authMethod ? { auth_method: authMethod } : {}),
      ...(apiKeyName ? { api_key_name: apiKeyName } : {}),
      message_status: messageStatus,
      is_sub_agent_message: isSubAgentMessage ? "true" : "false",
      origin,
    },
  }));
}

// ---------------------------------------------------------------------------
// Tool use events
// ---------------------------------------------------------------------------

export interface ToolAction {
  toolName: string;
  mcpServerId: string | null;
  internalMCPServerName: InternalMCPServerNameType | null;
  status: string;
  executionDurationMs: number | null;
}

/**
 * Build aggregated Metronome tool_use events for an agent message.
 * Actions are grouped by (toolName, internalMCPServerName, mcpServerId, status)
 * — one event per group with `count` and `total_execution_duration_ms`.
 *
 * transaction_id pattern: tool-{workspaceId}-{conversationId}-{agentMessageId}-{runKey}-{toolHash}
 * toolHash is a 12-char SHA-256 of toolName|mcpServerId|status to keep under 128 chars.
 */
export function buildToolUseEvents({
  workspaceId,
  conversationId,
  userId,
  agentMessageId,
  agentId,
  parentAgentMessageId,
  runKey,
  actions,
  origin,
  isProgrammaticUsage,
  authMethod,
  apiKeyName,
  messageStatus,
  isSubAgentMessage,
  timestamp,
}: {
  workspaceId: string;
  conversationId: string;
  userId: string | null;
  agentMessageId: string;
  agentId: string | null;
  parentAgentMessageId: string | null;
  runKey: string;
  actions: ToolAction[];
  origin: UserMessageOrigin;
  isProgrammaticUsage: boolean;
  authMethod: string | null;
  apiKeyName: string | null;
  messageStatus: string;
  isSubAgentMessage: boolean;
  timestamp: string;
}): MetronomeEvent[] {
  // Group actions by (toolName, internalMCPServerName, mcpServerId, status).
  const groups = new Map<
    string,
    { action: ToolAction; count: number; totalDurationMs: number }
  >();
  for (const action of actions) {
    const key = `${action.toolName}|${action.internalMCPServerName ?? ""}|${action.mcpServerId ?? ""}|${action.status}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.totalDurationMs += action.executionDurationMs ?? 0;
    } else {
      groups.set(key, {
        action,
        count: 1,
        totalDurationMs: action.executionDurationMs ?? 0,
      });
    }
  }

  return [...groups.values()].map(({ action, count, totalDurationMs }) => ({
    transaction_id: truncateTransactionId(
      `tool-${workspaceId}-${conversationId}-${agentMessageId}-${runKey}-${action.toolName}-${action.mcpServerId ?? ""}-${action.status}`
    ),
    customer_id: workspaceId,
    event_type: "tool_use",
    timestamp,
    properties: {
      workspace_id: workspaceId,
      ...(userId ? { user_id: userId } : {}),
      agent_message_id: agentMessageId,
      conversation_id: conversationId,
      ...(agentId ? { agent_id: agentId } : {}),
      ...(parentAgentMessageId
        ? { parent_agent_message_id: parentAgentMessageId }
        : {}),
      ...(authMethod ? { auth_method: authMethod } : {}),
      ...(apiKeyName ? { api_key_name: apiKeyName } : {}),
      tool_name: truncatePropertyValue(action.toolName),
      mcp_server_id: truncatePropertyValue(action.mcpServerId ?? ""),
      internal_mcp_server_name: truncatePropertyValue(
        action.internalMCPServerName ?? ""
      ),
      tool_category: getToolCategory(action.internalMCPServerName),
      // Constant grouping key — used as presentation_group_key in Metronome to
      // aggregate all tool categories into a single "Tool Usage" invoice line.
      tool_group: "tools",
      status: action.status,
      count,
      total_execution_duration_ms: totalDurationMs,
      is_programmatic_usage: isProgrammaticUsage ? "true" : "false",
      message_status: messageStatus,
      is_sub_agent_message: isSubAgentMessage ? "true" : "false",
      origin,
    },
  }));
}

// ---------------------------------------------------------------------------
// Workspace gauge event (daily)
// ---------------------------------------------------------------------------

/**
 * Build a single workspace gauge event carrying all daily snapshot properties.
 * One event per workspace per day — Metronome billable metrics pick the
 * property they care about.
 *
 * transaction_id pattern: workspace-gauge-{workspaceId}-{YYYY-MM-DD}
 */
export function buildWorkspaceGaugeEvent({
  workspaceId,
  memberCount,
  mau1Count,
  mau5Count,
  mau10Count,
  timestamp,
  dateKey,
}: {
  workspaceId: string;
  memberCount: number;
  mau1Count: number;
  mau5Count: number;
  mau10Count: number;
  timestamp: string;
  // YYYY-MM-DD — used as the idempotent transaction ID so re-runs on the same
  // day are deduplicated by Metronome.
  dateKey: string;
}): MetronomeEvent {
  return {
    transaction_id: `workspace-gauge-${workspaceId}-${dateKey}`,
    customer_id: workspaceId,
    event_type: "workspace_gauge",
    timestamp,
    properties: {
      workspace_id: workspaceId,
      member_count: memberCount,
      mau_1_count: mau1Count,
      mau_5_count: mau5Count,
      mau_10_count: mau10Count,
    },
  };
}
