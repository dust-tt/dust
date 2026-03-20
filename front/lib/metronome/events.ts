import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";

import type { MetronomeEvent } from "./client";

// AWU message tier: determines credit cost and quota bucket.
// "basic" = standard models, no expensive tools
// "advanced" = frontier/reasoning models, deep research, generation, orchestration
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

type ToolCategory =
  | "retrieval"
  | "deep_research"
  | "reasoning"
  | "connectors"
  | "generation"
  | "agents"
  | "actions"
  | "platform";

const TOOL_CATEGORY_MAP: Partial<
  Record<InternalMCPServerNameType, ToolCategory>
> = {
  // Retrieval — searching knowledge bases and data sources.
  search: "retrieval",
  query_tables_v2: "retrieval",
  data_warehouses: "retrieval",
  [`data_sources_file_system` as const]: "retrieval",
  include_data: "retrieval",
  conversation_files: "retrieval",

  // Deep research — web search, browsing, HTTP.
  [`web_search_&_browse` as const]: "deep_research",
  http_client: "deep_research",

  // Reasoning — extended thinking.
  // (dust_reasoning would go here if it were an internal server name)

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
  if (!internalMCPServerName) {
    // External MCP servers (user-configured remote servers).
    return "actions";
  }
  return (
    TOOL_CATEGORY_MAP[internalMCPServerName as InternalMCPServerNameType] ??
    "actions"
  );
}

export function buildLlmUsageEvents({
  workspaceSId,
  userId,
  agentMessageSId,
  runUsages,
  origin,
  isProgrammaticUsage,
  messageTier,
  isSubAgentMessage,
  timestamp,
}: {
  workspaceSId: string;
  userId: string | null;
  agentMessageSId: string;
  runUsages: RunUsageType[];
  origin: UserMessageOrigin;
  isProgrammaticUsage: boolean;
  messageTier: MessageTier;
  isSubAgentMessage: boolean;
  timestamp: string;
}): MetronomeEvent[] {
  return runUsages.map((usage, index) => ({
    transaction_id: `llm-${workspaceSId}-${agentMessageSId}-${usage.modelId}-${index}`,
    customer_id: workspaceSId,
    event_type: "llm_usage",
    timestamp,
    properties: {
      workspace_id: workspaceSId,
      ...(userId ? { user_id: userId } : {}),
      agent_message_id: agentMessageSId,
      provider_id: usage.providerId,
      model_id: usage.modelId,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      cached_tokens: usage.cachedTokens ?? 0,
      cache_creation_tokens: usage.cacheCreationTokens ?? 0,
      // Provider cost without markup — markup is applied in Metronome rate card.
      cost_micro_usd: usage.costMicroUsd,
      is_programmatic_usage: isProgrammaticUsage ? "true" : "false",
      // AWU classification: "basic" or "advanced" (determines credit cost and quota).
      message_tier: messageTier,
      // Sub-agent messages may be excluded from billing (metered at parent level only).
      is_sub_agent_message: isSubAgentMessage ? "true" : "false",
      origin,
    },
  }));
}

export function buildToolUseEvents({
  workspaceSId,
  userId,
  agentMessageSId,
  actions,
  origin,
  isProgrammaticUsage,
  messageTier,
  isSubAgentMessage,
  timestamp,
}: {
  workspaceSId: string;
  userId: string | null;
  agentMessageSId: string;
  actions: AgentMCPActionResource[];
  origin: UserMessageOrigin;
  isProgrammaticUsage: boolean;
  messageTier: MessageTier;
  isSubAgentMessage: boolean;
  timestamp: string;
}): MetronomeEvent[] {
  return actions.map((action) => {
    const actionType = action.toJSON();
    return {
      transaction_id: `tool-${workspaceSId}-${actionType.sId}`,
      customer_id: workspaceSId,
      event_type: "tool_use",
      timestamp,
      properties: {
        workspace_id: workspaceSId,
        // User ID for per-seat credit tracking in Metronome.
        ...(userId ? { user_id: userId } : {}),
        agent_message_id: agentMessageSId,
        tool_name: actionType.toolName,
        mcp_server_id: actionType.mcpServerId ?? "",
        internal_mcp_server_name: actionType.internalMCPServerName ?? "",
        tool_category: getToolCategory(actionType.internalMCPServerName),
        status: actionType.status,
        execution_duration_ms: actionType.executionDurationMs ?? 0,
        is_programmatic_usage: isProgrammaticUsage ? "true" : "false",
        message_tier: messageTier,
        is_sub_agent_message: isSubAgentMessage ? "true" : "false",
        origin,
      },
    };
  });
}

export function buildSeatsGaugeEvent({
  workspaceSId,
  seatCount,
  timestamp,
}: {
  workspaceSId: string;
  seatCount: number;
  timestamp: string;
}): MetronomeEvent {
  return {
    transaction_id: `seats-${workspaceSId}-${timestamp}`,
    customer_id: workspaceSId,
    event_type: "seats",
    timestamp,
    properties: {
      workspace_id: workspaceSId,
      seat_count: seatCount,
    },
  };
}

export function buildMauGaugeEvent({
  workspaceSId,
  mauCount,
  timestamp,
}: {
  workspaceSId: string;
  mauCount: number;
  timestamp: string;
}): MetronomeEvent {
  return {
    transaction_id: `mau-${workspaceSId}-${timestamp}`,
    customer_id: workspaceSId,
    event_type: "mau",
    timestamp,
    properties: {
      workspace_id: workspaceSId,
      mau_count: mauCount,
    },
  };
}
