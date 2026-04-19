import { isToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type ResolveAuthenticationOutcome = "completed" | "denied";

export async function resolveAuthentication(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    messageId,
    outcome,
  }: {
    actionId: string;
    messageId: string;
    outcome: ResolveAuthenticationOutcome;
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
      outcome,
      workspaceId: owner.sId,
      userId: user?.sId,
    },
    "Resolve authentication request"
  );

  const {
    agentMessageId,
    agentMessageVersion,
    userMessageId,
    userMessageVersion,
    userMessageUserId,
    userMessageOrigin,
    branchId,
  } = await getUserMessageIdFromMessageId(auth, {
    messageId,
  });

  if (userMessageUserId !== user?.id) {
    return new Err(
      new DustError(
        "unauthorized",
        "User is not authorized to resolve authentication for this action"
      )
    );
  }

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  if (action.status !== "blocked_authentication_required") {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked for authentication: ${action.status}`
      )
    );
  }

  const [updatedCount] = await action.updateStatus(
    outcome === "completed" ? "ready_allowed_explicitly" : "denied"
  );

  if (updatedCount === 0) {
    logger.info(
      {
        actionId,
        messageId,
        workspaceId: owner.sId,
        userId: user?.sId,
      },
      "Authentication action already resolved"
    );

    return new Ok(undefined);
  }

  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return (
      isToolPersonalAuthRequiredEvent(payload) && payload.actionId === actionId
    );
  }, getMessageChannelId(messageId));

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForConversation(
      auth,
      conversation
    );

  if (blockedActions.some((a) => a.messageId === messageId)) {
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
      conversationBranchId: branchId,
      userMessageId,
      userMessageVersion,
      userMessageOrigin,
    },
    startStep: action.stepContent.step,
    waitForCompletion: true,
  });

  logger.info(
    {
      workspaceId: owner.sId,
      conversationId,
      messageId,
      actionId,
      outcome,
    },
    `Authentication ${outcome}, agent loop resumed`
  );

  return new Ok(undefined);
}
