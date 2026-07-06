import {
  getInternalMCPServerMetadata,
  type InternalMCPServerNameType,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { InternalMCPToolType } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { TOOL_COST_CATEGORIES, type ToolCostCategory } from "@app/lib/api/mcp";
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
// Tool category and billing info
// ---------------------------------------------------------------------------
// basic: 1 AWU, advanced: 3 AWU; freeUsage overrides to 0 AWU regardless of category

// Re-export from mcp so consumers can import from one place.
export { TOOL_COST_CATEGORIES, type ToolCostCategory } from "@app/lib/api/mcp";

// AWU price per tool invocation by category (1 AWU = $0.01). Canonical source
// for both the Tool Usage rate-card prices (scripts/metronome_setup.ts) and the
// runtime per-user AWU spend computation (per_user_usage.ts) — keep both in
// sync by importing from here rather than redefining.
export const TOOL_COST_CATEGORY_AWU_WEIGHTS: Record<ToolCostCategory, number> =
  {
    basic: 1,
    advanced: 3,
  };

export function isToolCostCategory(value: string): value is ToolCostCategory {
  return TOOL_COST_CATEGORIES.includes(value as ToolCostCategory);
}

export function getToolBillingInfo(
  serverName: string | null,
  toolName: string
): { toolCostCategory: ToolCostCategory; freeUsage: boolean } {
  if (!serverName || !isInternalMCPServerName(serverName)) {
    // External MCP servers (user-configured remote servers) are always advanced.
    return { toolCostCategory: "advanced", freeUsage: false };
  }
  const metadata = getInternalMCPServerMetadata(serverName);
  const tool = (metadata.tools as InternalMCPToolType[]).find(
    (t) => t.name === toolName
  );
  // Unknown tool on a known internal server — default to advanced, not free.
  if (!tool) {
    return { toolCostCategory: "advanced", freeUsage: false };
  }
  return { toolCostCategory: tool.toolCostCategory, freeUsage: tool.freeUsage };
}

// ---------------------------------------------------------------------------
// Usage type helpers
// ---------------------------------------------------------------------------

// Origins whose entire conversation is free (platform-assistive, not
// user-requested output).
export const FREE_ORIGINS: ReadonlySet<UserMessageOrigin> =
  new Set<UserMessageOrigin>(["agent_sidekick"]);

function isFreeOrigin(origin: UserMessageOrigin | null): boolean {
  if (origin == null) {
    return false;
  }

  return FREE_ORIGINS.has(origin);
}

export function getUsageType(
  isProgrammaticUsage: boolean,
  origin: UserMessageOrigin
): UsageType {
  if (isFreeOrigin(origin)) {
    return USAGE_TYPE_FREE;
  }
  return isProgrammaticUsage ? USAGE_TYPE_PROGRAMMATIC : USAGE_TYPE_USER;
}

function getToolUsageType(
  baseUsageType: UsageType,
  freeUsage: boolean
): UsageType {
  return freeUsage ? USAGE_TYPE_FREE : baseUsageType;
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
  runUsages: RunUsageType[],
  contextOrigin: UserMessageOrigin | null
): number {
  if (isFreeOrigin(contextOrigin)) {
    return 0;
  }

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
  runUsages: (RunUsageType & { runKey: string | null })[],
  contextOrigin: UserMessageOrigin | null
): number {
  if (isFreeOrigin(contextOrigin)) {
    return 0;
  }

  const byRunKey = new Map<string, RunUsageType[]>();
  for (const usage of runUsages) {
    const key = usage.runKey ?? LEGACY_RUN_KEY;
    const group = byRunKey.get(key) ?? [];
    group.push(usage);
    byRunKey.set(key, group);
  }

  let total = 0;
  for (const group of byRunKey.values()) {
    total += intelligenceAwuFromRunUsages(group, contextOrigin);
  }
  return total;
}

// Tool (platform action) credits for a set of executed actions. Each action
// costs a fixed number of credits depending on its credit cost category
// (free = 0, basic = 1, advanced = 3). Callers should pass only final-status
// actions (matching the usage_queue extraction) so this equals the billed amount.
export function toolAwuFromActions(
  actions: {
    internalMCPServerName: InternalMCPServerNameType | null;
    toolName: string;
  }[],
  contextOrigin: UserMessageOrigin | null
): number {
  return actions.reduce((total, action) => {
    return total + toolAwuFromAction(action, contextOrigin);
  }, 0);
}

export function toolAwuFromAction(
  action: {
    toolName: string;
    internalMCPServerName: InternalMCPServerNameType | null;
  },
  contextOrigin: UserMessageOrigin | null
): number {
  if (isFreeOrigin(contextOrigin)) {
    return 0;
  }
  const { toolCostCategory, freeUsage } = getToolBillingInfo(
    action.internalMCPServerName,
    action.toolName
  );
  if (freeUsage) {
    return 0;
  }
  return TOOL_COST_CATEGORY_AWU_WEIGHTS[toolCostCategory];
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
    const { toolCostCategory, freeUsage } = getToolBillingInfo(
      action.internalMCPServerName,
      action.toolName
    );
    const effectiveUsageType = getToolUsageType(usageType, freeUsage);
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
        tool_category: toolCostCategory,
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
