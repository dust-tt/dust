import {
  type InternalMCPServerNameType,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";

import type { MetronomeEvent } from "./types";

// ---------------------------------------------------------------------------
// AWU message tier
// ---------------------------------------------------------------------------

// "basic" = standard models, no expensive tools → 0 credits (working assumption)
// "advanced" = frontier/reasoning models OR premium tools → 1+ credits
export type MessageTier = "basic" | "advanced";

// Models considered "advanced" (frontier/reasoning) for AWU classification.
// Standard models (GPT-5 Mini, Claude Sonnet, Gemini Flash, small models) are "basic".
const ADVANCED_MODEL_PREFIXES = [
  "claude-opus",
  "claude-4-opus",
  "claude-3-opus",
  "gpt-5.4",
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5-",
  "gpt-4-turbo",
  "o1",
  "o3",
  "o4",
  "grok-4-latest",
  "gemini-3-pro",
  "gemini-3.1-pro",
  "gemini-2.5-pro",
];

// Tool categories that make a message "advanced" regardless of model.
const ADVANCED_TOOL_CATEGORIES: ToolCategory[] = [
  "deep_research",
  "generation",
  "agents",
];

function isAdvancedModel(modelId: string): boolean {
  return ADVANCED_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix));
}

/**
 * Classify a message as basic or advanced based on the models and tools used.
 * A message is "advanced" if it uses a frontier/reasoning model OR expensive tools.
 */
export function classifyMessageTier({
  modelIds,
  toolCategories,
}: {
  modelIds: string[];
  toolCategories: ToolCategory[];
}): MessageTier {
  if (modelIds.some(isAdvancedModel)) {
    return "advanced";
  }
  if (toolCategories.some((c) => ADVANCED_TOOL_CATEGORIES.includes(c))) {
    return "advanced";
  }
  return "basic";
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
 * transaction_id pattern: llm-{workspaceId}-{agentMessageId}-{runKey}-{providerId}-{modelId}
 */
export function buildLlmUsageEvents({
  workspaceId,
  userId,
  agentMessageId,
  parentAgentMessageId,
  runKey,
  runUsages,
  origin,
  isProgrammaticUsage,
  messageTier,
  isSubAgentMessage,
  timestamp,
}: {
  workspaceId: string;
  userId: string | null;
  agentMessageId: string;
  parentAgentMessageId: string | null;
  runKey: string;
  runUsages: RunUsageType[];
  origin: UserMessageOrigin;
  isProgrammaticUsage: boolean;
  messageTier: MessageTier;
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
    transaction_id: `llm-${workspaceId}-${agentMessageId}-${runKey}-${group.providerId}-${group.modelId}`,
    customer_id: workspaceId,
    event_type: "llm_usage",
    timestamp,
    properties: {
      workspace_id: workspaceId,
      ...(userId ? { user_id: userId } : {}),
      agent_message_id: agentMessageId,
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
      message_tier: messageTier,
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
 * transaction_id pattern: tool-{workspaceId}-{agentMessageId}-{runKey}-{toolName}-{mcpServerId}-{status}
 */
export function buildToolUseEvents({
  workspaceId,
  userId,
  agentMessageId,
  parentAgentMessageId,
  runKey,
  actions,
  origin,
  isProgrammaticUsage,
  messageTier,
  isSubAgentMessage,
  timestamp,
}: {
  workspaceId: string;
  userId: string | null;
  agentMessageId: string;
  parentAgentMessageId: string | null;
  runKey: string;
  actions: ToolAction[];
  origin: UserMessageOrigin;
  isProgrammaticUsage: boolean;
  messageTier: MessageTier;
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
    transaction_id: `tool-${workspaceId}-${agentMessageId}-${runKey}-${action.toolName}-${action.mcpServerId ?? ""}-${action.status}`,
    customer_id: workspaceId,
    event_type: "tool_use",
    timestamp,
    properties: {
      workspace_id: workspaceId,
      ...(userId ? { user_id: userId } : {}),
      agent_message_id: agentMessageId,
      ...(parentAgentMessageId
        ? { parent_agent_message_id: parentAgentMessageId }
        : {}),
      tool_name: action.toolName,
      mcp_server_id: action.mcpServerId ?? "",
      internal_mcp_server_name: action.internalMCPServerName ?? "",
      tool_category: getToolCategory(action.internalMCPServerName),
      // Constant grouping key — used as presentation_group_key in Metronome to
      // aggregate all tool categories into a single "Tool Usage" invoice line.
      tool_group: "tools",
      status: action.status,
      count,
      total_execution_duration_ms: totalDurationMs,
      is_programmatic_usage: isProgrammaticUsage ? "true" : "false",
      message_tier: messageTier,
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
