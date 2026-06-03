import {
  type InternalMCPServerNameType,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { createHash } from "crypto";

import {
  USAGE_TYPE_FREE,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "./constants";
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
// Basic: 1 AWU
// Advanced: 3 AWU
export const TOOL_CATEGORIES = ["basic", "advanced"] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

// AWU price per tool invocation by category (1 AWU = $0.01). Canonical source
// for both the Tool Usage rate-card prices (scripts/metronome_setup.ts) and the
// runtime per-user AWU spend computation (per_user_usage.ts) — keep both in
// sync by importing from here rather than redefining.
export const TOOL_CATEGORY_AWU_WEIGHTS: Record<ToolCategory, number> = {
  basic: 1,
  advanced: 3,
};

export function isToolCategory(value: string): value is ToolCategory {
  return value in TOOL_CATEGORY_AWU_WEIGHTS;
}

// Exhaustive map — TypeScript will error if a new internal MCP server is added
// without being categorized here.
const TOOL_CATEGORY_MAP: Record<InternalMCPServerNameType, ToolCategory> = {
  // Basic (1 AWU) — web search, orchestration, platform utilities.
  "web_search_&_browse": "basic",
  run_agent: "basic",
  agent_router: "basic",
  agent_sidekick_agent_state: "basic",
  agent_sidekick_context: "basic",
  agent_management: "basic",
  agent_memory: "basic",
  run_dust_app: "basic",
  common_utilities: "basic",
  toolsets: "basic",
  user_mentions: "basic",
  missing_action_catcher: "basic",
  primitive_types_debugger: "basic",
  jit_testing: "basic",
  skill_management: "basic",
  schedules_management: "basic",
  pod_manager: "basic",
  pod_tasks: "basic",
  poke: "basic",
  ask_user_question: "basic",
  wakeups: "basic",
  plan_mode: "basic",

  // Advanced (3 AWU) — retrieval, MCP read/write, data warehouse, generation, sandbox
  search: "advanced",
  query_tables_v2: "advanced",
  data_warehouses: "advanced",
  data_sources_file_system: "advanced",
  include_data: "advanced",
  conversation_files: "advanced",
  files: "advanced",
  extract_data: "advanced",
  http_client: "advanced",
  sandbox: "advanced",
  file_generation: "advanced",
  image_generation: "advanced",
  sound_studio: "advanced",
  speech_generator: "advanced",
  slideshow: "advanced",
  interactive_content: "advanced",
  confluence: "advanced",
  databricks: "advanced",
  fathom: "advanced",
  freshservice: "advanced",
  github: "advanced",
  gmail: "advanced",
  google_calendar: "advanced",
  google_drive: "advanced",
  google_sheets: "advanced",
  hubspot: "advanced",
  jira: "advanced",
  luma: "advanced",
  microsoft_drive: "advanced",
  microsoft_excel: "advanced",
  microsoft_teams: "advanced",
  monday: "advanced",
  notion: "advanced",
  openai_usage: "advanced",
  outlook_calendar: "advanced",
  outlook: "advanced",
  productboard: "advanced",
  salesforce: "advanced",
  salesloft: "advanced",
  slab: "advanced",
  slack: "advanced",
  slack_bot: "advanced",
  snowflake: "advanced",
  statuspage: "advanced",
  ukg_ready: "advanced",
  val_town: "advanced",
  vanta: "advanced",
  front: "advanced",
  gong: "advanced",
  zendesk: "advanced",
  ashby: "advanced",
  clari_copilot: "advanced",
};

export function getToolCategory(
  internalMCPServerName: string | null
): ToolCategory {
  if (
    !internalMCPServerName ||
    !isInternalMCPServerName(internalMCPServerName)
  ) {
    // External MCP servers (user-configured remote servers) fall into advanced
    // as "Custom MCP call".
    return "advanced";
  }
  return TOOL_CATEGORY_MAP[internalMCPServerName];
}

// ---------------------------------------------------------------------------
// Usage type helpers
// ---------------------------------------------------------------------------

export type UsageType =
  | typeof USAGE_TYPE_USER
  | typeof USAGE_TYPE_PROGRAMMATIC
  | typeof USAGE_TYPE_FREE;

// Origins whose entire conversation is free (platform-assistive, not
// user-requested output).
const FREE_ORIGINS: ReadonlySet<string> = new Set<string>(["agent_sidekick"]);

// Internal MCP servers whose tool invocations are always free regardless of
// the message-level usage type (platform plumbing, not user output).
const FREE_TOOL_SERVERS: ReadonlySet<string> = new Set<string>([
  "agent_router",
  "common_utilities",
  "toolsets",
  "agent_memory",
]);

export function getUsageType(
  isProgrammaticUsage: boolean,
  origin: string
): UsageType {
  if (FREE_ORIGINS.has(origin)) {
    return USAGE_TYPE_FREE;
  }
  return isProgrammaticUsage ? USAGE_TYPE_PROGRAMMATIC : USAGE_TYPE_USER;
}

function getToolUsageType(
  baseUsageType: UsageType,
  internalMCPServerName: string | null
): UsageType {
  if (internalMCPServerName && FREE_TOOL_SERVERS.has(internalMCPServerName)) {
    return USAGE_TYPE_FREE;
  }
  return baseUsageType;
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
  isByok,
  conversationId,
  userId,
  agentMessageId,
  agentId,
  parentAgentMessageId,
  runKey,
  runUsages,
  origin,
  usageType,
  authMethod,
  apiKeyName,
  messageStatus,
  isSubAgentMessage,
  timestamp,
}: {
  workspaceId: string;
  isByok: boolean;
  conversationId: string;
  userId: string | null;
  agentMessageId: string;
  agentId: string | null;
  parentAgentMessageId: string | null;
  runKey: string;
  runUsages: RunUsageType[];
  origin: UserMessageOrigin;
  usageType: UsageType;
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
    transaction_id: `llm3-${workspaceId}-${conversationId}-${agentMessageId}-${runKey}-${group.providerId}-${group.modelId}`,
    customer_id: workspaceId,
    event_type: "llm_usage_v3",
    timestamp,
    properties: {
      workspace_id: workspaceId,
      user_id: userId ?? "unknown",
      is_byok: isByok ? "true" : "false",
      agent_message_id: agentMessageId,
      conversation_id: conversationId,
      agent_id: agentId ?? "unknown",
      parent_agent_message_id: parentAgentMessageId ?? "none",
      provider_id: group.providerId,
      model_id: group.modelId,
      prompt_tokens: group.promptTokens,
      completion_tokens: group.completionTokens,
      cached_tokens: group.cachedTokens,
      cache_creation_tokens: group.cacheCreationTokens,
      // Provider cost without markup — markup is applied in Metronome rate card. Only used for legacy rates.
      cost_micro_usd: group.costMicroUsd,
      // 1 AWU credit = $0.0085
      cost_awu: Math.ceil(group.costMicroUsd / 0.85 / 10_000),
      // TODO: Remove is_programmatic_usage & is_free_usage, this is replaced by single property "usage type"
      is_programmatic_usage:
        usageType === USAGE_TYPE_PROGRAMMATIC ? "true" : "false",
      is_free_usage: usageType === USAGE_TYPE_FREE ? "true" : "false",
      [USAGE_TYPE_GROUP_KEY]: usageType,
      auth_method: authMethod ?? "unknown",
      api_key_name: apiKeyName ?? "unknown",
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
  usageType,
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
  usageType: UsageType;
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

  return [...groups.values()].map(({ action, count, totalDurationMs }) => {
    const effectiveUsageType = getToolUsageType(
      usageType,
      action.internalMCPServerName
    );
    return {
      transaction_id: truncateTransactionId(
        `tool3-${workspaceId}-${conversationId}-${agentMessageId}-${runKey}-${action.toolName}-${action.mcpServerId ?? ""}-${action.status}`
      ),
      customer_id: workspaceId,
      event_type: "tool_use_v3",
      timestamp,
      properties: {
        workspace_id: workspaceId,
        user_id: userId ?? "unknown",
        agent_message_id: agentMessageId,
        conversation_id: conversationId,
        agent_id: agentId ?? "unknown",
        parent_agent_message_id: parentAgentMessageId ?? "none",
        auth_method: authMethod ?? "unknown",
        api_key_name: apiKeyName ?? "unknown",
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
        // TODO: Remove is_programmatic_usage, this is replaced by single property "usage type"
        is_programmatic_usage:
          effectiveUsageType === USAGE_TYPE_PROGRAMMATIC ? "true" : "false",
        [USAGE_TYPE_GROUP_KEY]: effectiveUsageType,
        message_status: messageStatus,
        is_sub_agent_message: isSubAgentMessage ? "true" : "false",
        origin,
      },
    };
  });
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
