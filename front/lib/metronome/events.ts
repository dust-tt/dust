import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import {
  buildAgentMessageBillingPlan,
  isFreeOrigin,
  isToolCostCategory,
  TOOL_COST_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/credits/agent_message_billing";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { createHash } from "crypto";

import { getMetronomeIngestAlias } from "./client";
import {
  toFreeMetronomeUserId,
  USAGE_TYPE_FREE,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "./constants";
import type { MetronomeEvent, UsageType } from "./types";

export { TOOL_COST_CATEGORIES, type ToolCostCategory } from "@app/lib/api/mcp";
export {
  awuFromMicroUsd,
  computeRunKey,
  FREE_ORIGINS,
  getToolBillingInfo,
  isFreeOrigin,
  isToolCostCategory,
  TOOL_COST_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/credits/agent_message_billing";

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
// Usage type helpers
// ---------------------------------------------------------------------------

export function getUsageType(
  isProgrammaticUsage: boolean,
  origin: UserMessageOrigin
): UsageType {
  if (isFreeOrigin(origin)) {
    return USAGE_TYPE_FREE;
  }
  return isProgrammaticUsage ? USAGE_TYPE_PROGRAMMATIC : USAGE_TYPE_USER;
}

function getToolUsageType({
  baseUsageType,
  isFreeUsage,
}: {
  baseUsageType: UsageType;
  isFreeUsage: boolean;
}): UsageType {
  return isFreeUsage ? USAGE_TYPE_FREE : baseUsageType;
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
  return buildAgentMessageBillingPlan({
    actions: [],
    contextOrigin,
    runUsages: runUsages.map((usage) => ({ ...usage, runKey: null })),
  }).totals.llmBilledCredits;
}

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
  return buildAgentMessageBillingPlan({
    actions: [],
    contextOrigin,
    runUsages,
  }).totals.llmBilledCredits;
}

// Tool (platform action) credits for a set of actions. Each action costs a
// fixed number of credits depending on its credit cost category (free = 0,
// basic = 1, advanced = 3).
export function toolAwuFromActions(
  actions: {
    internalMCPServerName: InternalMCPServerNameType | null;
    toolName: string;
    status: ToolExecutionStatus;
  }[],
  contextOrigin: UserMessageOrigin | null
): number {
  return buildAgentMessageBillingPlan({
    actions,
    contextOrigin,
    runUsages: [],
  }).totals.toolBilledCredits;
}

export function toolAwuFromAction(
  action: {
    toolName: string;
    internalMCPServerName: InternalMCPServerNameType | null;
    status: ToolExecutionStatus;
  },
  contextOrigin: UserMessageOrigin | null
): number {
  return buildAgentMessageBillingPlan({
    actions: [action],
    contextOrigin,
    runUsages: [],
  }).totals.toolBilledCredits;
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
  const billingPlan = buildAgentMessageBillingPlan({
    actions: [],
    contextOrigin: origin,
    runUsages: runUsages.map((usage) => ({ ...usage, runKey })),
  });

  return billingPlan.llm.map((group) => ({
    transaction_id: `llm3-${workspaceId}-${conversationId}-${agentMessageId}-${runKey}-${group.providerId}-${group.modelId}`,
    customer_id: getMetronomeIngestAlias(workspaceId),
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
      prompt_tokens: group.promptTokensCount,
      completion_tokens: group.completionTokensCount,
      cached_tokens: group.cachedTokensCount,
      cache_creation_tokens: group.cacheCreationTokensCount,
      // Provider cost without markup — markup is applied in Metronome rate card. Only used for legacy rates.
      cost_micro_usd: group.providerCostMicroUsd,
      // 1 AWU credit = $0.0085
      cost_awu: group.ratedCredits,
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

interface ToolAction {
  toolName: string;
  mcpServerId: string | null;
  internalMCPServerName: InternalMCPServerNameType | null;
  status: ToolExecutionStatus;
  executionDurationMs: number | null;
  // The billing plan needs every chronological action in the message to apply
  // the per-server cap, while each execution emits only its own actions.
  shouldEmit: boolean;
}

/**
 * Build aggregated Metronome tool_use events for an agent message.
 * Actions are grouped by (toolName, internalMCPServerName, mcpServerId, status,
 * billingDisposition). Each group produces one event with `count` and
 * `total_execution_duration_ms`.
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
  const billingPlan = buildAgentMessageBillingPlan({
    actions,
    contextOrigin: origin,
    runUsages: [],
  });

  // Group actions by (toolName, internalMCPServerName, mcpServerId, status,
  // billingDisposition). The disposition split is required when one execution
  // contains both paid and post-cap calls to the same tool.
  const groups = new Map<
    string,
    {
      billingLine: (typeof billingPlan.tools)[number];
      count: number;
      totalDurationMs: number;
    }
  >();
  for (const billingLine of billingPlan.tools) {
    if (!billingLine.action.shouldEmit) {
      continue;
    }
    // Metronome prices every emitted tool event. Actions that never reached the
    // tool must therefore be omitted rather than represented as zero-cost.
    if (billingLine.billingDisposition === "unbillable_status") {
      continue;
    }
    const { action } = billingLine;
    const key = `${action.toolName}|${action.internalMCPServerName ?? ""}|${action.mcpServerId ?? ""}|${action.status}|${billingLine.billingDisposition}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      existing.totalDurationMs += action.executionDurationMs ?? 0;
    } else {
      groups.set(key, {
        billingLine,
        count: 1,
        totalDurationMs: action.executionDurationMs ?? 0,
      });
    }
  }

  return [...groups.values()].map(({ billingLine, count, totalDurationMs }) => {
    const { action, billingDisposition, toolCostCategory } = billingLine;
    const effectiveUsageType = getToolUsageType({
      baseUsageType: usageType,
      isFreeUsage: billingDisposition !== "billed",
    });
    const transactionIdDispositionSuffix =
      billingDisposition === "free_mcp_server_cap"
        ? `-${billingDisposition}`
        : "";
    return {
      transaction_id: truncateTransactionId(
        `tool3-${workspaceId}-${conversationId}-${agentMessageId}-${runKey}-${action.toolName}-${action.mcpServerId ?? ""}-${action.status}${transactionIdDispositionSuffix}`
      ),
      customer_id: getMetronomeIngestAlias(workspaceId),
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
// Aggregated usage event (shadow — not yet ingested)
// ---------------------------------------------------------------------------

/**
 * Build the single aggregated Metronome llm_usage_v3 event for one agent-message
 * execution: LLM (intelligence) and tool (platform action) costs are computed on
 * our side and summed into one `cost_awu`.
 *
 * This is the target shape that will eventually replace the per-model
 * `buildLlmUsageEvents` + per-tool `buildToolUseEvents` events. For now it is
 * only used to shadow-compute the aggregated amount for a parity log, so its
 * result is NOT ingested.
 *
 * `cost_awu` is the net billed credits: free origins, the per-server tool cap
 * and free tools are already waived in the number, so Metronome would price it
 * as a flat multiply on the shared AWU rate. Only actions belonging to this
 * execution (`shouldEmit`) contribute; prior-execution actions are still fed to
 * the billing plan so the per-server cap is applied across the whole message.
 *
 * transaction_id pattern: usage3-{workspaceId}-{conversationId}-{agentMessageId}-{runKey}
 */
export function buildUsageEvents({
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
  actions: ToolAction[];
  origin: UserMessageOrigin;
  usageType: UsageType;
  authMethod: string | null;
  apiKeyName: string | null;
  messageStatus: string;
  isSubAgentMessage: boolean;
  timestamp: string;
}): MetronomeEvent[] {
  const billingPlan = buildAgentMessageBillingPlan({
    actions,
    contextOrigin: origin,
    runUsages: runUsages.map((usage) => ({ ...usage, runKey })),
  });

  // Only actions belonging to this execution are billed here — prior-execution
  // actions were billed by their own event but are kept in the plan so the
  // per-server cap sees the whole message.
  const emittedToolLines = billingPlan.tools.filter(
    (line) => line.action.shouldEmit
  );
  const toolBilledCredits = emittedToolLines.reduce(
    (total, line) => total + line.billedCredits,
    0
  );

  // Nothing to attribute for this execution (e.g. a resume that only replays
  // prior actions): emit no event.
  if (billingPlan.llm.length === 0 && emittedToolLines.length === 0) {
    return [];
  }

  const costAwu = billingPlan.totals.llmBilledCredits + toolBilledCredits;

  // Aggregate token counts across models for observability only — the billable
  // metric sums `cost_awu` and ignores these.
  const tokenTotals = billingPlan.llm.reduce(
    (totals, group) => ({
      promptTokens: totals.promptTokens + group.promptTokensCount,
      completionTokens: totals.completionTokens + group.completionTokensCount,
      cachedTokens: totals.cachedTokens + group.cachedTokensCount,
      cacheCreationTokens:
        totals.cacheCreationTokens + group.cacheCreationTokensCount,
      costMicroUsd: totals.costMicroUsd + group.providerCostMicroUsd,
    }),
    {
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      costMicroUsd: 0,
    }
  );

  return [
    {
      transaction_id: truncateTransactionId(
        `usage3-${workspaceId}-${conversationId}-${agentMessageId}-${runKey}`
      ),
      customer_id: getMetronomeIngestAlias(workspaceId),
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
        // Required by the billable metric but intentionally not granular: LLM and
        // tool cost are aggregated into this single event.
        provider_id: "aggregate",
        model_id: "aggregate",
        prompt_tokens: tokenTotals.promptTokens,
        completion_tokens: tokenTotals.completionTokens,
        cached_tokens: tokenTotals.cachedTokens,
        cache_creation_tokens: tokenTotals.cacheCreationTokens,
        // Provider cost without markup — observability only. 1 AWU = $0.0085.
        cost_micro_usd: tokenTotals.costMicroUsd,
        // Net billed credits (LLM + tools) computed on our side; waivers already
        // applied, so Metronome prices this as a flat multiply on the AWU rate.
        cost_awu: costAwu,
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
    },
  ];
}

/**
 * Sum the AWU that Metronome will bill from a set of legacy usage events:
 * `llm_usage_v3` → `cost_awu`; `tool_use_v3` → `count` × the tool category
 * weight. Events tagged `usage_type: free` are priced at 0 and contribute
 * nothing. Used to shadow-compare the legacy per-model/per-tool events against
 * the aggregated `buildUsageEvents` cost before switching over.
 */
export function billedCostAwuFromEvents(events: MetronomeEvent[]): number {
  return events.reduce((total, event) => {
    // The rate card only prices the paid usage types; "free" and any other
    // value are entitled at 0, so only count "user" and "programmatic".
    const usageType = event.properties[USAGE_TYPE_GROUP_KEY];
    if (
      usageType !== USAGE_TYPE_USER &&
      usageType !== USAGE_TYPE_PROGRAMMATIC
    ) {
      return total;
    }
    if (event.event_type === "tool_use_v3") {
      const category = event.properties["tool_category"];
      const count = event.properties["count"];
      if (
        typeof category === "string" &&
        isToolCostCategory(category) &&
        typeof count === "number"
      ) {
        return total + count * TOOL_COST_CATEGORY_AWU_WEIGHTS[category];
      }
      return total;
    }
    const costAwu = event.properties["cost_awu"];
    return total + (typeof costAwu === "number" ? costAwu : 0);
  }, 0);
}
