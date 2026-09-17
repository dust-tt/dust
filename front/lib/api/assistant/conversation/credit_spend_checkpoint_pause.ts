import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
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
 * update and, when another resolution already applied, the call MUST return `Ok` without
 * relaunching anything.
 */
/**
 * @cc [owner:avervaet,label:backend] checkpoint-resume-next-step
 * Resolving a pause MUST relaunch the loop at the step after the message's highest persisted
 * step content, transitioning the message off `paused` first. If the launch fails, the message
 * MUST be put back to `paused` so the user can retry.
 */
async function relaunchAfterCheckpointResolution(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    agentLoopArgs,
    agentMessage,
    resolvedStatus,
    startAsToolFreeGracefulStop,
  }: {
    agentLoopArgs: AgentLoopArgs;
    agentMessage: AgentMessageType;
    resolvedStatus: "acknowledged" | null;
    startAsToolFreeGracefulStop: boolean;
  }
): Promise<Result<void, DustError | Error>> {
  const agentMessageModelId: ModelId = agentMessage.agentMessageId;

  const { applied } =
    await ConversationResource.transitionAgentMessageCreditSpendCheckpointStatus(
      auth,
      { agentMessageModelId, from: "paused", to: resolvedStatus }
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
    startAsToolFreeGracefulStop,
    // Avoid racing with the workflow that just paused: wait for its run to be reported done
    // before starting the resumed one.
    waitForCompletion: true,
  });
  if (launchRes.isErr()) {
    // Without a running workflow the message would be stuck off `paused` with nothing to clear
    // it, so put it back in its paused state and let the user retry.
    await ConversationResource.transitionAgentMessageCreditSpendCheckpointStatus(
      auth,
      { agentMessageModelId, from: resolvedStatus, to: "paused" }
    );
    return new Err(launchRes.error);
  }

  return new Ok(undefined);
}

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

  return relaunchAfterCheckpointResolution(auth, conversation, {
    ...foundRes.value,
    resolvedStatus: "acknowledged",
    startAsToolFreeGracefulStop: false,
  });
}

/**
 * @cc [owner:avervaet,label:backend;product] checkpoint-decline-wrap-up
 * Declining MUST produce the wrap-up recap through the loop's own tool-free graceful-stop step
 * (see `tool-free-graceful-stop-start`) rather than a bespoke LLM call, so it goes through the
 * loop's normal persistence, streaming, and per-execution-scoped finalize side effects.
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

  return relaunchAfterCheckpointResolution(auth, conversation, {
    ...foundRes.value,
    resolvedStatus: null,
    startAsToolFreeGracefulStop: true,
  });
}
