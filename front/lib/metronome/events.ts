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
 * Build a single Metronome llm_usage event for an agent message, aggregating
 * all LLM calls (tokens, cost) into one event.
 *
 * transaction_id pattern: llm-{workspaceId}-{agentMessageId}
 */
export function buildLlmUsageEvent({
  workspaceId,
  userId,
  agentMessageId,
  parentAgentMessageId,
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
  runUsages: RunUsageType[];
  origin: UserMessageOrigin;
  isProgrammaticUsage: boolean;
  messageTier: MessageTier;
  isSubAgentMessage: boolean;
  timestamp: string;
}): MetronomeEvent {
  const promptTokens = runUsages.reduce((sum, u) => sum + u.promptTokens, 0);
  const completionTokens = runUsages.reduce(
    (sum, u) => sum + u.completionTokens,
    0
  );
  const cachedTokens = runUsages.reduce(
    (sum, u) => sum + (u.cachedTokens ?? 0),
    0
  );
  const cacheCreationTokens = runUsages.reduce(
    (sum, u) => sum + (u.cacheCreationTokens ?? 0),
    0
  );
  const costMicroUsd = runUsages.reduce((sum, u) => sum + u.costMicroUsd, 0);

  return {
    transaction_id: `llm-${workspaceId}-${agentMessageId}`,
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
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cached_tokens: cachedTokens,
      cache_creation_tokens: cacheCreationTokens,
      // Provider cost without markup — markup is applied in Metronome rate card.
      cost_micro_usd: costMicroUsd,
      is_programmatic_usage: isProgrammaticUsage ? "true" : "false",
      message_tier: messageTier,
      is_sub_agent_message: isSubAgentMessage ? "true" : "false",
      origin,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool use events
// ---------------------------------------------------------------------------

interface ToolAction {
  sId: string;
  toolName: string;
  mcpServerId: string | null;
  internalMCPServerName: InternalMCPServerNameType | null;
  status: string;
  executionDurationMs: number | null;
}

/**
 * Build one Metronome event per MCP action within an agent message.
 *
 * transaction_id pattern: tool-{workspaceId}-{actionSId}
 */
export function buildToolUseEvents({
  workspaceId,
  userId,
  agentMessageId,
  parentAgentMessageId,
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
  actions: ToolAction[];
  origin: UserMessageOrigin;
  isProgrammaticUsage: boolean;
  messageTier: MessageTier;
  isSubAgentMessage: boolean;
  timestamp: string;
}): MetronomeEvent[] {
  return actions.map((action) => ({
    transaction_id: `tool-${workspaceId}-${action.sId}`,
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
      execution_duration_ms: action.executionDurationMs ?? 0,
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
