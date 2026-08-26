import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { recordAgentMessageTotal } from "@app/lib/api/assistant/consumption/counters";
import { recordAgentMessageCreditCounters } from "@app/lib/api/assistant/credit_counters";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import type { Authenticator } from "@app/lib/auth";
import {
  buildAgentMessageBillingPlan,
  computeRunKey,
} from "@app/lib/credits/agent_message_billing";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { getUsageType } from "@app/lib/metronome/events";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

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
    rootAgentMessageId,
    rootAgentMessageModelId,
  }: {
    agentMessageId: string;
    dustRunIds?: string[];
    rootAgentMessageId?: string;
    rootAgentMessageModelId?: ModelId;
  }
): Promise<number | null> {
  const creditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
      rootAgentMessageId,
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
    rootAgentMessageModelId: resolvedRootAgentMessageModelId,
    status,
    runIds,
    triggeringUserMessageOrigin,
    triggeringUserId,
    triggeringUserMessageAuthMethod,
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
      isProgrammaticUsage(auth, {
        userMessageOrigin: messageOrigin,
        userId: triggeringUserId,
        messageAuthMethod: triggeringUserMessageAuthMethod,
      }),
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

  const consumptionRootAgentMessageModelId =
    rootAgentMessageModelId ?? resolvedRootAgentMessageModelId;
  if (consumptionRootAgentMessageModelId !== null) {
    await recordAgentMessageTotal({
      workspaceId: auth.getNonNullableWorkspace().sId,
      rootAgentMessageId: consumptionRootAgentMessageModelId,
      agentMessageId: agentMessageModelId,
      totalCreditAmountMicro: roundCreditsToMicroCredits(costCredits ?? 0),
    });
  } else if (rootAgentMessageId) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        rootAgentMessageId,
        agentMessageId,
      },
      "[Consumption] Root agent message not found for shadow write."
    );
  }

  // `costCredits` is the message-level running total (recomputed from all
  // accumulated runIds + actions), and a message can be finalized multiple
  // times (agent-loop early exit, tool confirmation, authentication resume,
  // Temporal retry). The stored column is overwritten with the total, but the
  // usage counters are additive — so only the newly-accrued delta since the
  // last finalize (`total − previouslyStored`) may be recorded, or repeated
  // finalizes would over-count. A retry with no new usage yields a 0 delta.
  const recordedCostDelta =
    costCredits !== null ? costCredits - (previousCostCredits ?? 0) : 0;

  await recordAgentMessageCreditCounters(auth, {
    creditAmount: recordedCostDelta,
    userMessageOrigin: messageOrigin,
  });

  return costCredits;
}
