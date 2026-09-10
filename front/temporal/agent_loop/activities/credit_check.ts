import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import {
  checkCreditSpendCheckpointGate,
  checkPoolCreditGate,
} from "@app/lib/api/assistant/credit_check";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { awuFromMicroUsd } from "@app/lib/credits/agent_message_billing";
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

export type CreditSpendCheckpointActivityResult = {
  crossed: boolean;
  // Once true, the workflow stops calling this activity for the rest of the
  // execution: the user already acknowledged the checkpoint, or the message is
  // exempt from it. Neither can flip back within an execution.
  skipRemainingChecks: boolean;
};

const NOT_CROSSED: CreditSpendCheckpointActivityResult = {
  crossed: false,
  skipRemainingChecks: false,
};

/**
 * Has this agent message's own spend crossed the credit spend checkpoint?
 * When it has, the pause is persisted on the message and the user is notified.
 */
export async function checkCreditSpendCheckpointActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<CreditSpendCheckpointActivityResult> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  const state =
    await ConversationResource.fetchAgentMessageCreditSpendCheckpointState(
      auth,
      { agentMessageId: agentLoopArgs.agentMessageId }
    );
  if (state?.status === "acknowledged") {
    return { crossed: false, skipRemainingChecks: true };
  }

  const consumedAwuCredits = await getConsumedAwuCredits(auth, {
    runIds: state?.runIds ?? [],
  });

  const result = await checkCreditSpendCheckpointGate(auth, {
    consumedAwuCredits,
  });
  if (!result.crossed) {
    return NOT_CROSSED;
  }

  const runAgentDataRes = await getFullAgentLoopDataWithAuth(
    auth,
    agentLoopArgs
  );
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      return { crossed: true, skipRemainingChecks: false };
    }
    throw normalizeError(runAgentDataRes.error);
  }
  const { agentConfiguration, agentMessage, conversation, userMessage } =
    runAgentDataRes.value;

  // A sub-agent message has no user watching it: the parent tool waits on the
  // child's stream and nothing renders the pause card, so pausing here would
  // only leave the parent hanging. The parent message runs its own checkpoint.
  if (userMessage.agenticMessageData) {
    return { crossed: false, skipRemainingChecks: true };
  }

  const step = maxBy(agentMessage.contents, "step")?.step ?? 0;

  // Persisted here so the pause survives a refresh.
  await ConversationResource.markAgentMessageCreditSpendCheckpointPaused(auth, {
    agentMessageModelId: agentMessage.agentMessageId,
  });

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

  return { crossed: true, skipRemainingChecks: false };
}
