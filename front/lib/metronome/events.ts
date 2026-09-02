import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import {
  buildAgentMessageBillingPlan,
  isFreeOrigin,
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

// Intelligence (AI compute) credits for a *single execution's* run usages.
// Usages are grouped by (providerId, modelId) and converted per group before
// summing — this mirrors the per-execution `buildUsageEvents` event so the
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
// Usage events
// ---------------------------------------------------------------------------

interface ToolAction {
  toolName: string;
  mcpServerId: string | null;
  internalMCPServerName: InternalMCPServerNameType | null;
  status: ToolExecutionStatus;
  // The billing plan needs every chronological action in the message to apply
  // the per-server cap, while each execution emits only its own actions.
  shouldEmit: boolean;
}

/**
 * Build the single aggregated Metronome llm_usage_v3 event for one agent-message
 * execution: LLM (intelligence) and tool (platform action) costs are computed on
 * our side and summed into one `cost_awu`. This is the only Metronome usage
 * event we emit — `model_id`/`provider_id` are constant placeholders since the
 * cost is no longer reported per model or per tool.
 *
 * `cost_awu` is the net billed credits: free origins, the per-server tool cap
 * and free tools are already waived in the number, so Metronome prices it as a
 * flat multiply on the shared AWU rate. Only actions belonging to this execution
 * (`shouldEmit`) contribute; prior-execution actions are still fed to the
 * billing plan so the per-server cap is applied across the whole message.
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
