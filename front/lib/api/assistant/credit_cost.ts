import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { makeFairUseAwuCreditsRateLimitKeyForUser } from "@app/lib/api/assistant/rate_limits";
import { recordProgrammaticSpendLimitUsage } from "@app/lib/api/credits/programmatic_usage_limit";
import { recordApiKeySpendLimitUsage } from "@app/lib/api/keys/spend_limit";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import {
  recordFreeSeatLifetimeUsage,
  recordUserSpendLimitUsage,
} from "@app/lib/api/users/spend_limit";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  buildAgentMessageBillingPlan,
  computeRunKey,
} from "@app/lib/credits/agent_message_billing";
import { getUsageType } from "@app/lib/metronome/events";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { spendLimitCycleOverrideForAuth } from "@app/lib/spend_limits/cycle";
import {
  addRateLimiterCount,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";

interface CreditActionMinimalInput {
  toolName: string;
  internalMCPServerName: InternalMCPServerNameType | null;
  mcpServerId?: string | null;
  status: ToolExecutionStatus;
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

  // Repair legacy run usages that predate creation-time classification. New
  // rows are already classified and this fallback never overwrites them.
  const messageOrigin = triggeringUserMessageOrigin ?? "web";
  await RunResource.setUsageTypeForRunsIfMissing(auth, {
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
      mcpServerId: action.metadata.mcpServerId ?? null,
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

  const user = auth.user();
  const plan = auth.plan();
  const assistantLimits = plan?.limits.assistant;

  // Feature flags gate the fair-use recording and the spend-cap backups below;
  // fetch once when there is a delta to record.
  const featureFlags = recordedCostDelta > 0 ? await getFeatureFlags(auth) : [];

  if (
    user &&
    assistantLimits &&
    recordedCostDelta > 0 &&
    assistantLimits.maxAwuCredits !== -1 &&
    !featureFlags.includes("disable_fair_use_awu_limit")
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

  // Record against the spend-cap backups (Redis fixed-window counters over the
  // contract billing cycle).
  if (recordedCostDelta > 0) {
    if (featureFlags.includes("enforce_user_spend_limit_rate_cap")) {
      // Per-user cap.
      if (user) {
        await recordUserSpendLimitUsage(auth, {
          user,
          incrementBy: recordedCostDelta,
          cycle: spendLimitCycleOverrideForAuth(auth),
        });

        // Free seats accrue against a lifetime counter (their enforced limiter)
        // instead of the per-cycle cap. Their per-cycle counter above is
        // recorded but never read.
        const membership =
          await MembershipResource.getActiveMembershipOfUserInWorkspace({
            user,
            workspace: auth.getNonNullableWorkspace(),
          });
        if (membership?.seatType === "free") {
          await recordFreeSeatLifetimeUsage(auth, {
            user,
            incrementBy: recordedCostDelta,
          });
        }
      }

      // Per-API-key cap, for calls authenticated with an API key.
      const apiKey = auth.key();
      if (apiKey) {
        await recordApiKeySpendLimitUsage(auth, {
          keyModelId: apiKey.id,
          incrementBy: recordedCostDelta,
        });
      }

      // Workspace programmatic cap, for programmatic calls.
      if (isProgrammaticUsage(auth, { userMessageOrigin: messageOrigin })) {
        await recordProgrammaticSpendLimitUsage(auth, {
          incrementBy: recordedCostDelta,
        });
      }
    }
  }

  return costCredits;
}
