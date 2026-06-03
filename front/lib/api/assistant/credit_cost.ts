import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import type { Authenticator } from "@app/lib/auth";
import {
  intelligenceAwuFromRunUsages,
  toolAwuFromActions,
} from "@app/lib/metronome/events";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

interface CreditActionMinimalInput {
  internalMCPServerName: string | null;
  status: ToolExecutionStatus;
}

interface CreditAgentMessageMinimalInput {
  id: ModelId;
  runIds: string[] | null;
}

export function computeAgentMessageCredits({
  runUsages,
  actions,
}: {
  runUsages: RunUsageType[];
  actions: CreditActionMinimalInput[];
}): number | null {
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
 * agent message. Returns the computed value (or null when there is nothing to track) so callers
 * can attach it to the terminal `agent_message_done` event and update the live client without a
 * reload.
 *
 * Computes from the message's full accumulated runIds + all final-status actions (the message-level
 * total), so re-runs (interrupt/resume) overwrite the stored value with the complete cost. Only
 * persists for statuses we track for billing, matching the Metronome gate.
 */
export async function computeAndStoreAgentMessageCredits(
  auth: Authenticator,
  { agentMessageId }: { agentMessageId: string }
): Promise<number | null> {
  const workspace = auth.getNonNullableWorkspace();

  const messageRow = await MessageModel.findOne({
    where: { sId: agentMessageId, workspaceId: workspace.id },
    include: [{ model: AgentMessageModel, as: "agentMessage", required: true }],
  });

  const agentMessage = messageRow?.agentMessage;
  if (!agentMessage) {
    logger.warn(
      { workspaceId: workspace.sId, agentMessageId },
      "[Credits] Agent message not found while computing costCredits."
    );
    return null;
  }

  if (!AGENT_MESSAGE_STATUSES_TO_TRACK.includes(agentMessage.status)) {
    return null;
  }

  const [runUsagesByAgentMessageId, actions] = await Promise.all([
    fetchRunUsagesByAgentMessageId(auth, [
      { id: agentMessage.id, runIds: agentMessage.runIds },
    ]),
    AgentMCPActionResource.listByAgentMessageIds(auth, [agentMessage.id]),
  ]);

  const costCredits = computeAgentMessageCredits({
    runUsages: runUsagesByAgentMessageId.get(agentMessage.id) ?? [],
    actions: actions.map((action) => ({
      internalMCPServerName: action.metadata.internalMCPServerName,
      status: action.status,
    })),
  });

  await AgentMessageModel.update(
    { costCredits },
    { where: { id: agentMessage.id, workspaceId: workspace.id } }
  );

  return costCredits;
}

async function fetchRunUsagesByAgentMessageId(
  auth: Authenticator,
  agentMessages: CreditAgentMessageMinimalInput[]
): Promise<Map<ModelId, RunUsageType[]>> {
  const result = new Map<ModelId, RunUsageType[]>();

  const dustRunIds = [...new Set(agentMessages.flatMap((m) => m.runIds ?? []))];
  if (dustRunIds.length === 0) {
    return result;
  }

  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });

  const dustRunIdByRunModelId = new Map(runs.map((r) => [r.id, r.dustRunId]));
  const usagesByDustRunId = new Map<string, RunUsageType[]>();
  for (const usage of usages) {
    const dustRunId = dustRunIdByRunModelId.get(usage.runModelId);
    if (!dustRunId) {
      continue;
    }
    const existing = usagesByDustRunId.get(dustRunId);
    if (existing) {
      existing.push(usage);
    } else {
      usagesByDustRunId.set(dustRunId, [usage]);
    }
  }

  for (const message of agentMessages) {
    result.set(
      message.id,
      (message.runIds ?? []).flatMap(
        (runId) => usagesByDustRunId.get(runId) ?? []
      )
    );
  }

  return result;
}

export async function computeConversationCreditCost(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<number | null> {
  const agentMessages =
    await ConversationResource.listAgentMessageStoredCredits(
      auth,
      conversation.id
    );

  let total = 0;
  let hasBillableUsage = false;
  for (const message of agentMessages) {
    if (message.costCredits !== null) {
      total += message.costCredits;
      hasBillableUsage = true;
    }
  }

  return hasBillableUsage ? total : null;
}
