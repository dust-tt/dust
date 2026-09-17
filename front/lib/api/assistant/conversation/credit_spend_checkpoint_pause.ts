import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import { finalizeAgentMessagesWithoutWorkflow } from "@app/lib/api/cancel";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { getFullAgentLoopDataWithAuth } from "@app/types/assistant/agent_run";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import maxBy from "lodash/maxBy";

export type CreditSpendCheckpointDecision = "continue" | "decline";

// Same lookup and permission rule as tool validation, plus the pause check.
async function findPausedAgentMessage(
  auth: Authenticator,
  conversation: ConversationResource,
  { messageId }: { messageId: string }
): Promise<
  Result<
    {
      agentLoopArgs: AgentLoopArgs;
      agentMessage: AgentMessageType;
      conversation: ConversationType;
    },
    DustError
  >
> {
  const {
    agentMessageId,
    agentMessageVersion,
    userMessageId,
    userMessageVersion,
    userMessageUserId,
    userMessageOrigin,
  } = await getUserMessageIdFromMessageId(auth, { messageId });

  if (
    !canCurrentUserRespondToParentUserMessage({
      parentUserId: userMessageUserId,
      currentUserId: auth.user()?.id,
    })
  ) {
    return new Err(
      new DustError(
        "unauthorized",
        "User is not authorized to resolve this pause"
      )
    );
  }

  const status =
    await ConversationResource.fetchAgentMessageCreditSpendCheckpointStatus(
      auth,
      { agentMessageId }
    );
  if (status !== "paused") {
    return new Err(
      new DustError(
        "agent_message_not_resumable",
        "Agent message is not paused at the spend checkpoint"
      )
    );
  }

  const agentLoopArgs: AgentLoopArgs = {
    agentMessageId,
    agentMessageVersion,
    conversationId: conversation.sId,
    conversationTitle: conversation.title,
    userMessageId,
    userMessageVersion,
    userMessageOrigin,
  };

  const dataRes = await getFullAgentLoopDataWithAuth(auth, agentLoopArgs);
  if (dataRes.isErr()) {
    return new Err(
      new DustError("agent_message_not_resumable", dataRes.error.message)
    );
  }

  return new Ok({
    agentLoopArgs,
    agentMessage: dataRes.value.agentMessage,
    conversation: dataRes.value.conversation,
  });
}

// The pause happens after a step fully completes, so the loop resumes at the next one.
function nextStep(agentMessage: AgentMessageType): number {
  return (maxBy(agentMessage.contents, "step")?.step ?? 0) + 1;
}

/**
 * @cc [owner:avervaet,label:backend;concurrency] checkpoint-single-resolution
 * A pause MUST be resolved at most once: the `paused` status is transitioned with a conditional
 * update and, when another resolution already applied, the call MUST return `Ok` without doing
 * anything else. The message MUST NOT be put back to `paused` when a workflow for it is already
 * running, since that would let another caller reclaim and relaunch an already-resolved pause.
 */
/**
 * @cc [owner:avervaet,label:backend] checkpoint-resume-next-step
 * Continuing MUST relaunch the loop at the step after the message's highest persisted step
 * content, transitioning the message off `paused` first. If the launch fails or throws, and no
 * workflow ended up running for it, the message MUST be put back to `paused` so the user can
 * retry.
 */
export async function continueCreditSpendCheckpointPause(
  auth: Authenticator,
  conversation: ConversationResource,
  { messageId }: { messageId: string }
): Promise<Result<void, DustError | Error>> {
  const foundRes = await findPausedAgentMessage(auth, conversation, {
    messageId,
  });
  if (foundRes.isErr()) {
    return foundRes;
  }
  const { agentLoopArgs, agentMessage } = foundRes.value;
  const agentMessageModelId: ModelId = agentMessage.agentMessageId;

  const { applied } =
    await ConversationResource.transitionAgentMessageCreditSpendCheckpointStatus(
      auth,
      { agentMessageModelId, from: "paused", to: "acknowledged" }
    );
  if (!applied) {
    logger.info(
      { agentMessageId: agentMessage.sId, conversationId: conversation.sId },
      "Spend checkpoint pause already resolved"
    );
    return new Ok(undefined);
  }

  const startStep = nextStep(agentMessage);
  let launchRes: Result<
    undefined,
    Error | DustError<"agent_loop_already_running">
  >;
  try {
    launchRes = await launchAgentLoopWorkflow({
      auth,
      agentLoopArgs,
      startStep,
      // Avoid racing with the workflow that just paused: wait for its run to be reported done
      // before starting the resumed one.
      waitForCompletion: true,
    });
  } catch (error) {
    launchRes = new Err(normalizeError(error));
  }
  if (launchRes.isErr()) {
    const isAlreadyRunning =
      launchRes.error instanceof DustError &&
      launchRes.error.code === "agent_loop_already_running";
    if (!isAlreadyRunning) {
      // Without a running workflow the message would be stuck off `paused` with nothing to clear
      // it, so put it back in its paused state and let the user retry.
      await ConversationResource.transitionAgentMessageCreditSpendCheckpointStatus(
        auth,
        { agentMessageModelId, from: "acknowledged", to: "paused" }
      );
    }
    return new Err(launchRes.error);
  }

  // Every viewer may be showing the pause; tell them the decision landed and the loop is back.
  await publishConversationRelatedEvent({
    conversationId: conversation.sId,
    step: startStep,
    event: {
      type: "agent_credit_spend_checkpoint_updated",
      created: Date.now(),
      configurationId: agentMessage.configuration.sId,
      messageId: agentMessage.sId,
      paused: false,
    },
  });

  return new Ok(undefined);
}

/**
 * @cc [owner:avervaet,label:backend;product] checkpoint-decline-cancels
 * Declining MUST NOT call the model again: the message is finalized as `cancelled` directly,
 * with no workflow involved, through the same path a stop uses when the loop cannot be
 * signalled. The checkpoint status MUST be transitioned to `"stopped"` before that finalization,
 * since finalizing only clears a `paused` status, so the decision stays readable afterwards and
 * distinct from a message that was never paused or was stopped some other way.
 */
export async function declineCreditSpendCheckpointPause(
  auth: Authenticator,
  conversation: ConversationResource,
  { messageId }: { messageId: string }
): Promise<Result<void, DustError | Error>> {
  const foundRes = await findPausedAgentMessage(auth, conversation, {
    messageId,
  });
  if (foundRes.isErr()) {
    return foundRes;
  }
  const { agentMessage } = foundRes.value;

  const { applied } =
    await ConversationResource.transitionAgentMessageCreditSpendCheckpointStatus(
      auth,
      {
        agentMessageModelId: agentMessage.agentMessageId,
        from: "paused",
        to: "stopped",
      }
    );
  if (!applied) {
    logger.info(
      { agentMessageId: agentMessage.sId, conversationId: conversation.sId },
      "Spend checkpoint pause already resolved"
    );
    return new Ok(undefined);
  }

  await finalizeAgentMessagesWithoutWorkflow(auth, {
    conversation,
    messageIds: [agentMessage.sId],
    status: "cancelled",
  });
  // The pause flagged the conversation as waiting on the user; nothing is anymore.
  await ConversationResource.clearActionRequired(auth, conversation.sId);

  return new Ok(undefined);
}
