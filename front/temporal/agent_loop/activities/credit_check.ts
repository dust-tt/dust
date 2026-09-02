import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import {
  checkCreditSpendCheckpointGate,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
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

async function hasAcknowledgedSpendCheckpoint(
  auth: Authenticator,
  { agentMessageId }: { agentMessageId: string }
): Promise<boolean> {
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
        attributes: ["spendCheckpointStatus"],
      },
    ],
  });

  return message?.agentMessage?.spendCheckpointStatus === "acknowledged";
}

/**
 * Does the current user's spend cross their workflow alert threshold?
 * `acknowledged` lets the workflow stop calling this activity for the
 * rest of the execution, since it can't flip back once observed true.
 */
export async function checkSpendCheckpointActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<{ crossed: boolean; acknowledged: boolean }> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  if (
    await hasAcknowledgedSpendCheckpoint(auth, {
      agentMessageId: agentLoopArgs.agentMessageId,
    })
  ) {
    return { crossed: false, acknowledged: true };
  }

  const result = await checkCreditSpendCheckpointGate(auth);
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
      spendCheckpointStatus: "paused",
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
      "[SpendCheckpoint] Failed to notify after persisting pause"
    );
  }

  return { crossed: true, acknowledged: false };
}
