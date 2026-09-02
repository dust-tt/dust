import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import {
  checkCreditSpendCheckpointGate,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { awuFromMicroUsd } from "@app/lib/credits/agent_message_billing";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import {
  getFullAgentLoopDataWithAuth,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import maxBy from "lodash/maxBy";

export async function checkCreditsActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<CreditCheckResult> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  return checkPoolCreditGate(auth, {
    userMessageOrigin: agentLoopArgs.userMessageOrigin ?? null,
  });
}

async function getAgentMessageCheckpointState(
  auth: Authenticator,
  { agentMessageId }: { agentMessageId: string }
): Promise<{ acknowledged: boolean; runIds: string[] }> {
  const message = await MessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: agentMessageId,
    },
    attributes: ["id"],
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        attributes: ["creditSpendCheckpointStatus", "runIds"],
      },
    ],
  });

  return {
    acknowledged:
      message?.agentMessage?.creditSpendCheckpointStatus === "acknowledged",
    runIds: message?.agentMessage?.runIds ?? [],
  };
}

/**
 * AWU credits spent so far by this agent message's own run (its accumulated
 * `runIds`), not the user's account-wide cycle spend. Mirrors the LLM-only,
 * pre-tool-cost approximation `checkCostAndSubagentsThresholds` uses for its
 * per-step hard-cap check.
 */
async function getConsumedAwuCredits(
  auth: Authenticator,
  { runIds }: { runIds: string[] }
): Promise<number> {
  if (runIds.length === 0) {
    return 0;
  }

  const runResources = await RunResource.listByDustRunIds(auth, {
    dustRunIds: runIds,
  });
  const runUsages = await RunResource.listRunUsagesForRuns(auth, {
    runs: runResources,
  });

  const totalCostMicroUsd = runUsages.reduce(
    (acc, usage) => acc + usage.costMicroUsd,
    0
  );

  return awuFromMicroUsd(totalCostMicroUsd);
}

/**
 * Does the current user's spend cross their workflow alert threshold?
 * `acknowledged` lets the workflow stop calling this activity for the
 * rest of the execution, since it can't flip back once observed true.
 */
export async function checkCreditSpendCheckpointActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<{ crossed: boolean; acknowledged: boolean }> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  const { acknowledged, runIds } = await getAgentMessageCheckpointState(auth, {
    agentMessageId: agentLoopArgs.agentMessageId,
  });
  if (acknowledged) {
    return { crossed: false, acknowledged: true };
  }

  const consumedAwuCredits = await getConsumedAwuCredits(auth, { runIds });

  const result = await checkCreditSpendCheckpointGate(auth, {
    consumedAwuCredits,
  });
  if (!result.crossed) {
    return { crossed: false, acknowledged: false };
  }

  const runAgentDataRes = await getFullAgentLoopDataWithAuth(
    auth,
    agentLoopArgs
  );
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      return { crossed: true, acknowledged: false };
    }
    throw normalizeError(runAgentDataRes.error);
  }
  const { agentConfiguration, agentMessage, conversation } =
    runAgentDataRes.value;

  const step = maxBy(agentMessage.contents, "step")?.step ?? 0;

  // Persisted here so the pause survives a refresh.
  await AgentMessageModel.update(
    {
      creditSpendCheckpointStatus: "paused",
    },
    {
      where: {
        id: agentMessage.agentMessageId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    }
  );

  try {
    await ConversationResource.markAsActionRequired(auth, { conversation });

    await publishConversationRelatedEvent({
      conversationId: conversation.sId,
      step,
      event: {
        type: "agent_credit_spend_checkpoint_reached",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        thresholdAwuCredits: result.thresholdAwuCredits,
      },
    });
  } catch (err) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
        error: normalizeError(err),
      },
      "[CreditSpendCheckpoint] Failed to notify after persisting pause"
    );
  }

  return { crossed: true, acknowledged: false };
}
