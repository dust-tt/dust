import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { isToolExecutionStatusBillable } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { makeFairUseAwuCreditsRateLimitKeyForUser } from "@app/lib/api/assistant/rate_limits";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { ToolCostCategory } from "@app/lib/api/mcp";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import { recordUserSpendLimitUsage } from "@app/lib/api/users/spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  buildAgentMessageBillingPlan,
  computeRunKey,
  getToolBillingInfo,
} from "@app/lib/credits/agent_message_billing";
import { getUsageType } from "@app/lib/metronome/events";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { spendLimitCycleOverrideForAuth } from "@app/lib/spend_limits/cycle";
import {
  addRateLimiterCount,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type {
  AgentMessageAnalyticsData,
  AgentMessageAnalyticsToolUsed,
} from "@app/types/assistant/analytics";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";

interface CreditActionMinimalInput {
  toolName: string;
  internalMCPServerName: InternalMCPServerNameType | null;
  status: ToolExecutionStatus;
}

export interface AgentMessageCreditsToolBreakdown {
  actionId: string;
  toolName: string;
  internalMCPServerName: InternalMCPServerNameType | null;
  toolCostCategory: ToolCostCategory;
  free: boolean;
  awu: number;
}

export interface AgentMessageCreditsBreakdown {
  llmAwu: number;
  toolAwu: number;
  totalAwu: number;
  byTool: AgentMessageCreditsToolBreakdown[];
}

/**
 * Fetches the stored analytics document for each message, keyed by messageId. Returns an empty
 * map (rather than failing) on an Elasticsearch error, since this only feeds a poke-only
 * auditing display, not the billing pipeline itself.
 */
export async function fetchAgentMessageCostAnalyticsByMessageIds(
  auth: Authenticator,
  { messageIds }: { messageIds: string[] }
): Promise<Map<string, AgentMessageAnalyticsData>> {
  if (messageIds.length === 0) {
    return new Map();
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const result = await searchAnalytics<AgentMessageAnalyticsData>(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspaceId } },
          { terms: { message_id: messageIds } },
        ],
      },
    },
    { size: messageIds.length }
  );

  if (result.isErr()) {
    logger.error(
      { workspaceId, error: result.error },
      "[Credits] Failed to fetch agent message cost analytics from Elasticsearch."
    );
    return new Map();
  }

  return new Map(
    result.value.hits.hits
      .flatMap((hit) => (hit._source ? [hit._source] : []))
      .map((doc) => [doc.message_id, doc])
  );
}

/**
 * Builds the LLM/tool cost split and per-tool breakdown for display (e.g. in poke) from the
 * message's stored analytics document, rather than recomputing it live from current code: the
 * analytics document is a frozen snapshot of the cost as computed by the billing pipeline at run
 * time, so comparing it against the stored `costCredits` catches genuine billing bugs instead of
 * drifting apart whenever the AWU pricing formulas are later tuned.
 *
 * The analytics document's `tools_used` entries carry no `actionId`, so they are matched back to
 * `actions` by `(step, toolName)`: both lists are built from the same ordered set of actions at
 * analytics-indexing time, so a positional match within that key is reliable in practice.
 */
export function buildAgentMessageCreditsBreakdownFromAnalytics({
  analytics,
  actions,
}: {
  analytics: Pick<AgentMessageAnalyticsData, "cost" | "tools_used"> | undefined;
  actions: (CreditActionMinimalInput & { actionId: string; step: number })[];
}): AgentMessageCreditsBreakdown | undefined {
  // `cost` and `tools_used` were added to the analytics document after it first shipped, so
  // older documents may be missing either (or the document itself may not exist yet for a very
  // recently sent message) — degrade to no breakdown rather than throwing on missing data.
  if (!analytics?.cost) {
    return undefined;
  }

  const toolUsageQueueByKey = new Map<
    string,
    AgentMessageAnalyticsToolUsed[]
  >();
  for (const tool of analytics.tools_used ?? []) {
    const key = `${tool.step_index}|${tool.tool_name}`;
    const queue = toolUsageQueueByKey.get(key) ?? [];
    queue.push(tool);
    toolUsageQueueByKey.set(key, queue);
  }

  const byTool: AgentMessageCreditsToolBreakdown[] = [];
  for (const action of actions) {
    const matched = toolUsageQueueByKey
      .get(`${action.step}|${action.toolName}`)
      ?.shift();
    if (!matched) {
      continue;
    }

    const { toolCostCategory } = getToolBillingInfo(
      action.internalMCPServerName,
      action.toolName
    );
    byTool.push({
      actionId: action.actionId,
      toolName: action.toolName,
      internalMCPServerName: action.internalMCPServerName,
      toolCostCategory,
      // "Free" means the tool ran and its category priced it at zero, not that it never ran.
      free:
        matched.cost_awu === 0 && isToolExecutionStatusBillable(action.status),
      awu: matched.cost_awu,
    });
  }

  return {
    llmAwu: analytics.cost.llm_awu,
    toolAwu: analytics.cost.tool_awu,
    totalAwu: analytics.cost.full_awu,
    byTool,
  };
}

export function computeAgentMessageCredits({
  runUsages,
  actions,
  contextOrigin,
}: {
  runUsages: (RunUsageType & { runKey: string | null })[];
  actions: CreditActionMinimalInput[];
  contextOrigin: UserMessageOrigin | null;
}): number | null {
  const billingPlan = buildAgentMessageBillingPlan({
    actions,
    contextOrigin,
    runUsages,
  });
  const hasBillableAction = billingPlan.tools.some(
    ({ billingDisposition }) => billingDisposition !== "unbillable_status"
  );

  // A free tool or free-origin action is still tracked with a zero charge. Only
  // actions that never reached execution are treated as no billable activity.
  if (runUsages.length === 0 && !hasBillableAction) {
    return null;
  }

  return billingPlan.totals.billedCredits;
}

/**
 * Compute the agent message credit cost once at the end of the agentic loop and persist it on the
 * agent message. Returns the computed value (or null when there is nothing to track).
 *
 * Called from the finalize activities (alongside the Metronome usage events it is derived from),
 * not from the hot terminal-event path, so publishing the terminal events stays lightweight. The
 * value is not pushed on any event — clients read it from the messages / conversation API on their
 * next revalidation.
 *
 * Computes from the message's full accumulated runIds + all final-status actions (the message-level
 * total), so re-runs (interrupt/resume) overwrite the stored value with the complete cost. Only
 * persists for statuses we track for billing, matching the Metronome gate.
 *
 * Before recomputing, this execution's runs are tagged with their runKey (from `dustRunIds`) so the
 * intelligence cost is ceiled per agent-loop execution — exactly matching the per-execution
 * Metronome events. Tagging is idempotent (same runIds → same runKey), so it stays overwrite-safe
 * across Temporal retries.
 */
export async function computeAndStoreAgentMessageCredits(
  auth: Authenticator,
  {
    agentMessageId,
    dustRunIds,
  }: { agentMessageId: string; dustRunIds?: string[] }
): Promise<number | null> {
  const creditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    });

  if (!creditContext) {
    logger.warn(
      { workspaceId: auth.getNonNullableWorkspace().sId, agentMessageId },
      "[Credits] Agent message not found while computing costCredits."
    );
    return null;
  }

  const {
    agentMessageModelId,
    status,
    runIds,
    triggeringUserMessageOrigin,
    previousCostCredits,
  } = creditContext;

  if (!AGENT_MESSAGE_STATUSES_TO_TRACK.includes(status)) {
    return null;
  }

  // Tag this execution's runs with their runKey before recomputing, so the
  // recompute (which reads the message's full accumulated runIds) ceils each
  // execution's intelligence cost independently. Prior executions tagged their
  // own runs in their own finalize.
  if (dustRunIds && dustRunIds.length > 0) {
    await RunResource.setRunKeyForDustRunIds(auth, {
      dustRunIds,
      runKey: computeRunKey(dustRunIds),
    });
  }

  // Fetch the message's runs once — reused to compute cost and to tag usage type.
  const runs = await RunResource.listByDustRunIds(auth, {
    dustRunIds: [...new Set(runIds ?? [])],
  });

  // Persist the billing usage type on the run usages so free/user/programmatic
  // consumption can be queried directly (e.g. free-usage monitoring). Reuses the
  // same origin-based classification as the Metronome events.
  const messageOrigin = triggeringUserMessageOrigin ?? "web";
  await RunResource.setUsageTypeForRuns(auth, {
    runs,
    usageType: getUsageType(
      isProgrammaticUsage(auth, { userMessageOrigin: messageOrigin }),
      messageOrigin
    ),
  });

  const [runUsages, actions] = await Promise.all([
    RunResource.listRunUsagesForRuns(auth, { runs }),
    AgentMCPActionResource.listByAgentMessageIds(auth, [agentMessageModelId]),
  ]);

  const costCredits = computeAgentMessageCredits({
    runUsages,
    actions: actions.map((action) => ({
      toolName: getToolNameFromFunctionCallName(action.functionCallName),
      internalMCPServerName: action.metadata.internalMCPServerName,
      status: action.status,
    })),
    contextOrigin: triggeringUserMessageOrigin,
  });

  await ConversationResource.updateAgentMessageCostCredits(auth, {
    agentMessageModelId,
    costCredits,
  });

  // `costCredits` is the message-level running total (recomputed from all
  // accumulated runIds + actions), and a message can be finalized multiple
  // times (agent-loop early exit, tool confirmation, authentication resume,
  // Temporal retry). The stored column is overwritten with the total, but the
  // usage counters are additive — so only the newly-accrued delta since the
  // last finalize (`total − previouslyStored`) may be recorded, or repeated
  // finalizes would over-count. A retry with no new usage yields a 0 delta.
  const recordedCostDelta =
    costCredits !== null ? costCredits - (previousCostCredits ?? 0) : 0;

  // Roll the same delta up into this message's `totalCostCredits` and that of
  // every run_agent ancestor, so the message-level total (own cost + all
  // sub-agent costs) can be read directly instead of walking the sub-agent tree
  // at read time. Additive and order-independent across parent/child finalizes.
  await ConversationResource.addTotalCostCreditsForMessageAndAncestors(auth, {
    agentMessageId,
    delta: recordedCostDelta,
  });

  const user = auth.user();
  const plan = auth.plan();
  const assistantLimits = plan?.limits.assistant;
  if (
    user &&
    assistantLimits &&
    recordedCostDelta > 0 &&
    assistantLimits.maxAwuCredits !== -1
  ) {
    // The limit guard lives in isMessagesLimitReached (pre-message), which reads
    // the count via getRateLimiterCount and blocks the next message once the
    // total reaches maxAwuCredits.
    await addRateLimiterCount({
      key: makeFairUseAwuCreditsRateLimitKeyForUser(
        auth.getNonNullableWorkspace(),
        user.toJSON(),
        assistantLimits.maxAwuCreditsTimeframe
      ),
      timeframeSeconds: getTimeframeSecondsFromLiteral(
        assistantLimits.maxAwuCreditsTimeframe
      ),
      incrementBy: recordedCostDelta,
      logger,
    });
  }

  // Record against the per-user spend-cap backup (Redis fixed-window counter
  // over the contract billing cycle). Independent of the plan-level fair-use
  // limiter above. Gated behind the same feature flag as enforcement so the
  // counter only accrues where the backup is active; enforcement happens
  // pre-message in `checkMessagesLimit`.
  // The cycle override keeps the counter on the same window
  // enforcement reads: the contract billing period on credit-priced plans, the
  // UTC calendar month elsewhere (no contract to anchor on).
  if (user && recordedCostDelta > 0) {
    const featureFlags = await getFeatureFlags(auth);
    if (featureFlags.includes("enforce_user_spend_limit_rate_cap")) {
      await recordUserSpendLimitUsage(auth, {
        user,
        incrementBy: recordedCostDelta,
        cycle: spendLimitCycleOverrideForAuth(auth),
      });
    }
  }

  return costCredits;
}
