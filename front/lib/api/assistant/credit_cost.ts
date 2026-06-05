import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import type { Authenticator } from "@app/lib/auth";
import {
  intelligenceAwuFromRunUsages,
  isFreeOrigin,
  toolAwuFromActions,
} from "@app/lib/metronome/events";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
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
  runUsages: RunUsageType[];
  actions: CreditActionMinimalInput[];
  isFreeUsage?: boolean;
}): number | null {
  if (isFreeUsage) {
    return 0;
  }

  const finalActions = actions.filter((a) =>
    isToolExecutionStatusFinal(a.status)
  );

  if (runUsages.length === 0 && finalActions.length === 0) {
    return null;
  }

  return (
    intelligenceAwuFromRunUsages(runUsages) + toolAwuFromActions(finalActions)
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
 */
export async function computeAndStoreAgentMessageCredits(
  auth: Authenticator,
  { agentMessageId }: { agentMessageId: string }
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

  return costCredits;
}

async function fetchRunUsagesForAgentMessage(
  auth: Authenticator,
  runIds: string[] | null
): Promise<RunUsageType[]> {
  const dustRunIds = [...new Set(runIds ?? [])];
  if (dustRunIds.length === 0) {
    return [];
  }

  // All runs are fetched from this message's own runIds, so every usage they
  // produce belongs to this message.
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  return RunResource.listRunUsagesForRuns(auth, { runs });
}
