import {
  AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD,
  CREDIT_APPROVAL_REQUIRED_ERROR_CODE,
  fetchCreditApprovalStep,
} from "@app/lib/api/assistant/credit_approval";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { UNRESUMABLE_AGENT_MESSAGE_STATUSES } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

/**
 * The user answered "yes, keep going" to the per-message credit prompt: clear the stop and resume
 * the message on the step it never got to run.
 *
 * Unlike `retryAgentMessage`, this does NOT create a new message version — re-running the message
 * from scratch would burn every credit it already spent, which is the opposite of what the safety
 * net is for. The message never left "created" while parked, so the loop just picks up where it
 * stopped.
 *
 * The `error` step content recording the request survives this reset, and that is what keeps the
 * gate from ever asking this message again (see `fetchCreditApprovalStep`).
 */
export async function resumeAfterCreditApproval(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  { messageId }: { messageId: string }
): Promise<Result<void, Error | DustError<"agent_loop_already_running">>> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  const message = await MessageModel.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
      workspaceId,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!message?.agentMessage || !message.parentId) {
    return new Err(new Error("Agent message not found"));
  }

  const { agentMessage } = message;

  if (agentMessage.errorCode !== CREDIT_APPROVAL_REQUIRED_ERROR_CODE) {
    return new Err(new Error("No pending credit approval for this message"));
  }

  // The message stays "created" while parked, but it can still have been cancelled or interrupted
  // in the meantime — resuming then would relaunch a run the user already abandoned.
  if (UNRESUMABLE_AGENT_MESSAGE_STATUSES.includes(agentMessage.status)) {
    return new Err(new Error("Agent message can no longer resume"));
  }

  const parentMessage = await MessageModel.findOne({
    where: {
      id: message.parentId,
      conversationId: conversation.id,
      workspaceId,
    },
    attributes: ["sId", "version"],
  });

  if (!parentMessage) {
    return new Err(new Error("User message not found"));
  }

  const resumeStep = await fetchCreditApprovalStep(auth, {
    agentMessageModelId: agentMessage.id,
  });

  if (resumeStep === null) {
    return new Err(new Error("Credit approval step content not found"));
  }

  // Read before clearing the error columns below: this is the cost the user was shown and
  // approved, which is what makes the resume log comparable to the interrupt one.
  const approvedCostCredits = agentMessage.errorMetadata?.costCredits;

  // Clear the stop so the UI stops rendering the prompt. The status was never moved off "created"
  // (this is a pause, not a failure), so there is nothing to restore there.
  await AgentMessageModel.update(
    {
      errorCode: null,
      errorMessage: null,
      errorMetadata: null,
    },
    { where: { id: agentMessage.id, workspaceId } }
  );

  // Drop the prompt from the stream so a client reconnecting with a `lastEventId` predating it
  // doesn't replay a question that has been answered.
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);

    return (
      payload.type === "agent_error" &&
      payload.error?.code === CREDIT_APPROVAL_REQUIRED_ERROR_CODE
    );
  }, getMessageChannelId(messageId));

  const launchRes = await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId: message.sId,
      agentMessageVersion: message.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      conversationBranchId: message.getBranchId(),
      userMessageId: parentMessage.sId,
      userMessageVersion: parentMessage.version,
    },
    startStep: resumeStep,
  });

  // Pairs with the "interrupted" log in `finalizeCreditApprovalRequest`
  logger.info(
    {
      agentMessageId: messageId,
      conversationId: conversation.sId,
      costCredits: approvedCostCredits,
      relaunched: launchRes.isOk(),
      step: resumeStep,
      thresholdCredits: AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD,
      userId: auth.user()?.sId ?? null,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    "[CreditApproval] Agent loop resumed: user approved continuing past the credit threshold"
  );

  return launchRes;
}
