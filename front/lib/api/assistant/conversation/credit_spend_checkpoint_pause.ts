import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { generateSmoothShutdownSummary } from "@app/lib/api/assistant/conversation/smooth_shutdown_summary";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { getFullAgentLoopDataWithAuth } from "@app/types/assistant/agent_run";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
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

  const state =
    await ConversationResource.fetchAgentMessageCreditSpendCheckpointState(
      auth,
      { agentMessageId }
    );
  if (state?.status !== "paused") {
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
 * update and, when another resolution already applied, the call MUST return `Ok` without
 * relaunching or finalizing anything.
 */
/**
 * @cc [owner:avervaet,label:backend] checkpoint-resume-next-step
 * Continuing MUST relaunch the loop at the step after the message's highest persisted step
 * content, marking the message `acknowledged` first. If the launch fails, the message MUST be
 * put back to `paused` so the user can retry.
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
  const agentMessageModelId = agentMessage.agentMessageId;

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

  const launchRes = await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs,
    startStep: nextStep(agentMessage),
    // Avoid racing with the workflow that just paused: wait for its run to be reported done
    // before starting the resumed one.
    waitForCompletion: true,
  });
  if (launchRes.isErr()) {
    // Without a running workflow an acknowledged message would be stuck, so put it back in its
    // paused state and let the user retry.
    await ConversationResource.transitionAgentMessageCreditSpendCheckpointStatus(
      auth,
      { agentMessageModelId, from: "acknowledged", to: "paused" }
    );
    return new Err(launchRes.error);
  }

  return new Ok(undefined);
}

async function writeSmoothShutdownRecap(
  auth: Authenticator,
  {
    agentMessage,
    conversation,
    step,
  }: {
    agentMessage: AgentMessageType;
    conversation: ConversationType;
    step: number;
  }
): Promise<void> {
  const summaryRes = await generateSmoothShutdownSummary(auth, conversation);
  if (summaryRes.isErr()) {
    logger.warn(
      {
        agentMessageId: agentMessage.sId,
        conversationId: conversation.sId,
        error: summaryRes.error,
      },
      "[SmoothShutdown] Failed to generate progress summary; stopping without one"
    );
    return;
  }

  await AgentStepContentResource.createNewVersion({
    workspaceId: auth.getNonNullableWorkspace().id,
    agentMessageId: agentMessage.agentMessageId,
    step,
    index: 0,
    type: "text_content",
    value: { type: "text_content", value: summaryRes.value },
  });
}

/**
 * @cc [owner:avervaet,label:backend] checkpoint-decline-no-refinalize
 * Declining MUST only write the recap, clear the action-required flag and mark the message
 * `gracefully_stopped` through the terminal-event path. It MUST NOT re-run the finalize side
 * effects (analytics, consumption attribution, usage tracking, Metronome events): the paused
 * finalize already ran them for this execution.
 */
export async function declineCreditSpendCheckpointPause(
  auth: Authenticator,
  conversation: ConversationResource,
  { messageId }: { messageId: string }
): Promise<Result<void, DustError>> {
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
        to: null,
      }
    );
  if (!applied) {
    logger.info(
      { agentMessageId: agentMessage.sId, conversationId: conversation.sId },
      "Spend checkpoint pause already resolved"
    );
    return new Ok(undefined);
  }

  // The pause was the only pending action; nothing relaunches the loop to clear it.
  await ConversationResource.clearActionRequiredForConversation(
    auth,
    conversation
  );

  const step = nextStep(agentMessage);
  await writeSmoothShutdownRecap(auth, {
    agentMessage,
    conversation: foundRes.value.conversation,
    step,
  });

  // Same terminal path as a graceful stop signalled to a running loop: persists the status and
  // publishes the event with the server-rendered content view, which now includes the recap.
  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "agent_message_gracefully_stopped",
      created: Date.now(),
      configurationId: agentMessage.configuration.sId,
      messageId: agentMessage.sId,
      message: agentMessage,
      runIds: [],
    },
    agentMessage,
    conversation: foundRes.value.conversation,
    step,
  });

  return new Ok(undefined);
}
