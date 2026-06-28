import {
  type InternalMCPServerNameType,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { createHash } from "crypto";

import {
  toFreeMetronomeUserId,
  USAGE_TYPE_FREE,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "./constants";
import type { MetronomeEvent, UsageType } from "./types";

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
  agent_memory: "basic",
  run_dust_app: "basic",
  common_utilities: "basic",
  toolsets: "basic",
  user_mentions: "basic",
  missing_action_catcher: "basic",
  primitive_types_debugger: "basic",
  jit_testing: "basic",
  skill_authoring: "basic",
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
  sandbox_functions: "advanced",
  file_generation: "advanced",
  image_generation: "advanced",
  sound_studio: "advanced",
  speech_generator: "advanced",
  interactive_content: "advanced",
  confluence: "advanced",
  databricks: "advanced",
  exa_people_and_company: "advanced",
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
  workspace_analytics: "advanced",
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

// Origins whose entire conversation is free (platform-assistive, not
// user-requested output).
export const FREE_ORIGINS: ReadonlySet<string> = new Set<string>([
  "agent_sidekick",
]);

// Internal MCP servers whose tool invocations are always free regardless of
// the message-level usage type (platform plumbing, not user output).
const FREE_TOOL_SERVERS: ReadonlySet<string> = new Set<string>([
  "agent_router",
  "common_utilities",
  "toolsets",
  "agent_memory",
]);

export function isFreeOrigin(origin: string): boolean {
  return FREE_ORIGINS.has(origin);
}

export function getUsageType(
  isProgrammaticUsage: boolean,
  origin: string
): UsageType {
  if (isFreeOrigin(origin)) {
    return USAGE_TYPE_FREE;
  }
  return isProgrammaticUsage ? USAGE_TYPE_PROGRAMMATIC : USAGE_TYPE_USER;
}

// A tool invocation is always free (priced at 0 in the rate card) when its
// internal MCP server is platform plumbing — see FREE_TOOL_SERVERS.
export function isFreeToolServer(
  internalMCPServerName: string | null
): boolean {
  return (
    internalMCPServerName !== null &&
    FREE_TOOL_SERVERS.has(internalMCPServerName)
  );
}

function getToolUsageType(
  baseUsageType: UsageType,
  internalMCPServerName: string | null
): UsageType {
  if (isFreeToolServer(internalMCPServerName)) {
    return USAGE_TYPE_FREE;
  }
  return baseUsageType;
}

// ---------------------------------------------------------------------------
// Run key
// ---------------------------------------------------------------------------

// Identifies a single agent-loop execution by the set of dustRunIds it
// produced. Same runIds → same key (so Metronome deduplicates retries and the
// credit-cost recompute groups runs the same way); a new execution
// (interrupt/resume) has different runIds → different key → additive billing.
// The credit-cost flow ceils intelligence cost per key, exactly matching the
// per-execution Metronome events.
export function computeRunKey(dustRunIds: string[]): string {
  return createHash("sha256")
    .update([...dustRunIds].sort().join(","))
    .digest("hex")
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// AWU credit conversion helpers
// ---------------------------------------------------------------------------
// These are the single source of truth for converting raw usage into AWU
// credits. They are used both when emitting Metronome billing events (below)
// and when surfacing the cost of a message/conversation to the frontend, so
// the displayed credits always match what is billed.

// Convert a raw model-compute cost in microUSD into AWU credits.
// 1 AWU credit = $0.0085 of compute (margin baked in), so 1 credit = 8500
// microUSD. Rounded up, matching the Metronome event conversion.
export function awuFromMicroUsd(microUsd: number): number {
  return Math.ceil(microUsd / 0.85 / 10_000);
}

// Intelligence (AI compute) credits for a *single execution's* run usages.
// Usages are grouped by (providerId, modelId) and converted per group before
// summing — this mirrors the per-execution `buildLlmUsageEvents` event so the
// total equals the billed amount for that execution. To get the message-level
// total across interrupt/resume executions, use
// `intelligenceAwuFromRunUsagesGroupedByRunKey` (which ceils per execution),
// not this directly over the union of all runs.
export function intelligenceAwuFromRunUsages(
  runUsages: RunUsageType[]
): number {
  const costByModel = new Map<string, number>();
  for (const usage of runUsages) {
    // Need this grouping to rightfully apply the Math.ceil in awuFromMicroUsd
    const key = `${usage.providerId}|${usage.modelId}`;
    costByModel.set(key, (costByModel.get(key) ?? 0) + usage.costMicroUsd);
  }

  let total = 0;
  for (const costMicroUsd of costByModel.values()) {
    total += awuFromMicroUsd(costMicroUsd);
  }
  return total;
}

// Synthetic group for run usages whose run has no runKey yet (legacy rows, or
// non-agent-loop runs). They are summed together so behavior matches the old
// single-ceil computation for them.
const LEGACY_RUN_KEY = "__legacy__";

// Intelligence credits for an agent message, ceiling per agent-loop execution
// (runKey) to exactly match the per-execution Metronome events. Metronome emits
// one additive event per execution (interrupt/resume → new runKey → new event),
// each ceiling per (providerId, modelId). Ceiling over the union of executions
// instead would undercount (`ceil(a) + ceil(b) >= ceil(a + b)`), so we group by
// runKey first, ceil each group via `intelligenceAwuFromRunUsages`, then sum.
export function intelligenceAwuFromRunUsagesGroupedByRunKey(
  runUsages: (RunUsageType & { runKey: string | null })[]
): number {
  const byRunKey = new Map<string, RunUsageType[]>();
  for (const usage of runUsages) {
    const key = usage.runKey ?? LEGACY_RUN_KEY;
    const group = byRunKey.get(key) ?? [];
    group.push(usage);
    byRunKey.set(key, group);
  }

  let total = 0;
  for (const group of byRunKey.values()) {
    total += intelligenceAwuFromRunUsages(group);
  }
  return total;
}

// Tool (platform action) credits for a set of executed actions. Each action
// costs a fixed number of credits depending on its category (basic = 1,
// advanced = 3), except free tools (FREE_TOOL_SERVERS, e.g. agent_memory) which
// are priced at 0 in the rate card and therefore contribute nothing. Callers
// should pass only final-status actions (matching the usage_queue extraction)
// so this equals the billed amount.
export function toolAwuFromActions(
  actions: { internalMCPServerName: string | null }[]
): number {
  return actions.reduce((total, action) => {
    if (isFreeToolServer(action.internalMCPServerName)) {
      return total;
    }
    return (
      total +
      TOOL_CATEGORY_AWU_WEIGHTS[getToolCategory(action.internalMCPServerName)]
    );
  }, 0);
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
  isFreeSeatedUser,
  agentMessageId,
  agentId,
  subAgentId,
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
  isFreeSeatedUser: boolean;
  agentMessageId: string;
  agentId: string | null;
  subAgentId: string | null;
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
      user_id: userId
        ? isFreeSeatedUser
          ? toFreeMetronomeUserId(userId)
          : userId
        : "unknown",
      is_byok: isByok ? "true" : "false",
      agent_message_id: agentMessageId,
      conversation_id: conversationId,
      agent_id: agentId ?? "unknown",
      sub_agent_id: subAgentId ?? "none",
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
      cost_awu: awuFromMicroUsd(group.costMicroUsd),
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
  isFreeSeatedUser,
  agentMessageId,
  agentId,
  subAgentId,
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
  isFreeSeatedUser: boolean;
  agentMessageId: string;
  agentId: string | null;
  subAgentId: string | null;
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
        user_id: userId
          ? isFreeSeatedUser
            ? toFreeMetronomeUserId(userId)
            : userId
          : "unknown",
        agent_message_id: agentMessageId,
        conversation_id: conversationId,
        agent_id: agentId ?? "unknown",
        sub_agent_id: subAgentId ?? "none",
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
