import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { makeFairUseAwuCreditsRateLimitKeyForUser } from "@app/lib/api/assistant/rate_limits";
import type { Authenticator } from "@app/lib/auth";
import {
  computeRunKey,
  intelligenceAwuFromRunUsagesGroupedByRunKey,
  isFreeOrigin,
  toolAwuFromActions,
} from "@app/lib/metronome/events";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";

interface CreditActionMinimalInput {
  internalMCPServerName: string | null;
  status: ToolExecutionStatus;
}

export function computeAgentMessageCredits({
  runUsages,
  actions,
  isFreeUsage = false,
}: {
  runUsages: (RunUsageType & { runKey: string | null })[];
  actions: CreditActionMinimalInput[];
  isFreeUsage?: boolean;
}): number | null {
  const finalActions = actions.filter((a) =>
    isToolExecutionStatusFinal(a.status)
  );

  if (runUsages.length === 0 && finalActions.length === 0) {
    return null;
  }

  if (isFreeUsage) {
    return 0;
  }

  // Intelligence cost is ceiled per agent-loop execution (runKey) to match the
  // per-execution Metronome events. Tool cost has no ceiling (fixed 1/3 per
  // action), so it is grouping-invariant and stays message-level.
  return (
    intelligenceAwuFromRunUsagesGroupedByRunKey(runUsages) +
    toolAwuFromActions(finalActions)
  );
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

  const { agentMessageModelId, status, runIds, triggeringUserMessageOrigin } =
    creditContext;

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

  const [runUsages, actions] = await Promise.all([
    fetchRunUsagesForAgentMessage(auth, runIds),
    AgentMCPActionResource.listByAgentMessageIds(auth, [agentMessageModelId]),
  ]);

  const costCredits = computeAgentMessageCredits({
    runUsages,
    actions: actions.map((action) => ({
      internalMCPServerName: action.metadata.internalMCPServerName,
      status: action.status,
    })),
    isFreeUsage:
      triggeringUserMessageOrigin !== null &&
      isFreeOrigin(triggeringUserMessageOrigin),
  });

  await ConversationResource.updateAgentMessageCostCredits(auth, {
    agentMessageModelId,
    costCredits,
  });

  const user = auth.user();
  const plan = auth.plan();
  const assistantLimits = plan?.limits.assistant;
  if (
    user &&
    assistantLimits &&
    costCredits !== null &&
    costCredits > 0 &&
    assistantLimits.maxAwuCredits !== -1
  ) {
    // We use rateLimiter infrastructure to enforce the fair use but ignore failure here since
    // this is run post message execution. The next agent loop will be stopped if we dropped to 0.
    await rateLimiter({
      key: makeFairUseAwuCreditsRateLimitKeyForUser(
        auth.getNonNullableWorkspace(),
        user.toJSON(),
        assistantLimits.maxAwuCreditsTimeframe
      ),
      maxPerTimeframe: assistantLimits.maxAwuCredits,
      timeframeSeconds: getTimeframeSecondsFromLiteral(
        assistantLimits.maxAwuCreditsTimeframe
      ),
      incrementBy: costCredits,
      logger,
    });
  }

  return costCredits;
}

async function fetchRunUsagesForAgentMessage(
  auth: Authenticator,
  runIds: string[] | null
): Promise<(RunUsageType & { runKey: string | null })[]> {
  const dustRunIds = [...new Set(runIds ?? [])];
  if (dustRunIds.length === 0) {
    return [];
  }

  // All runs are fetched from this message's own runIds, so every usage they
  // produce belongs to this message.
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  return RunResource.listRunUsagesForRuns(auth, { runs });
}
