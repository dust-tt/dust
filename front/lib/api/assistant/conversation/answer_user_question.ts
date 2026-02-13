import { isToolUserQuestionEvent } from "@app/lib/actions/mcp";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/mentions";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function answerUserQuestion(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    messageId,
    selectedOptions,
    customResponse,
  }: {
    actionId: string;
    messageId: string;
    selectedOptions?: number[];
    customResponse?: string;
  }
): Promise<Result<void, DustError>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();
  const { sId: conversationId, title: conversationTitle } = conversation;

  logger.info(
    {
      actionId,
      messageId,
      conversationId,
      workspaceId: owner.sId,
      userId: user?.sId,
    },
    "User question answer request"
  );

  const {
    agentMessageId,
    agentMessageVersion,
    userMessageId,
    userMessageVersion,
    userMessageUserId,
  } = await getUserMessageIdFromMessageId(auth, {
    messageId,
  });

  if (userMessageUserId !== user?.id) {
    return new Err(
      new DustError(
        "unauthorized",
        "User is not authorized to answer this question"
      )
    );
  }

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  const agentStepContent =
    await AgentStepContentResource.fetchByModelIdWithAuth(
      auth,
      action.stepContentId
    );
  if (!agentStepContent) {
    return new Err(
      new DustError(
        "internal_error",
        `Agent step content not found: ${action.stepContentId}`
      )
    );
  }

  if (action.status !== "blocked_user_question_required") {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked for user question: ${action.status}`
      )
    );
  }

  // Update resumeState to include the answer.
  await action.updateStepContext({
    ...action.stepContext,
    resumeState: {
      ...action.stepContext.resumeState,
      answer: {
        selectedOptions: selectedOptions ?? [],
        customResponse,
      },
    },
  });

  // Change status to ready so the tool re-runs.
  const [updatedCount] = await action.updateStatus("ready_allowed_explicitly");

  if (updatedCount === 0) {
    logger.info(
      {
        actionId,
        messageId,
        workspaceId: owner.sId,
        userId: user?.sId,
      },
      "Action already answered"
    );

    return new Ok(undefined);
  }

  // Remove the user question event from the message channel.
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isToolUserQuestionEvent(payload)
      ? payload.actionId === actionId
      : false;
  }, getMessageChannelId(messageId));

  // Only launch the agent loop if there are no remaining blocked actions.
  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversation
    );

  if (blockedActions.filter((a) => a.messageId === messageId).length > 0) {
    logger.info(
      { blockedActions },
      "Skipping agent loop launch because there are remaining blocked actions"
    );
    return new Ok(undefined);
  }

  await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      userMessageId,
      userMessageVersion,
    },
    startStep: agentStepContent.step,
    waitForCompletion: true,
  });

  logger.info(
    {
      workspaceId: owner.id,
      conversationId,
      messageId,
      actionId,
    },
    "User question answered, agent loop resumed"
  );

  return new Ok(undefined);
}
