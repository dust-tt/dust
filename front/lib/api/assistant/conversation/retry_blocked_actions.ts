import { isBlockedActionEvent } from "@app/lib/actions/mcp";
import { runAgentLoop } from "@app/lib/api/assistant/agent";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { Message } from "@app/lib/models/assistant/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import logger from "@app/logger/logger";
import type { ConversationType, Result } from "@app/types";
import { Err, Ok } from "@app/types";
import { getRunAgentData } from "@app/types/assistant/agent_run";

async function findUserMessageForRetry(
  auth: Authenticator,
  conversation: ConversationType,
  { messageId }: { messageId: string }
): Promise<
  Result<
    {
      agentMessageId: string;
      agentMessageVersion: number;
      lastStep: number;
      userMessageId: string;
      userMessageVersion: number;
    },
    Error
  >
> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  // Query 1: Get the message and its parentId.
  const agentMessage = await Message.findOne({
    where: {
      conversationId: conversation.id,
      sId: messageId,
      workspaceId,
    },
    attributes: ["agentMessageId", "parentId", "version", "sId"],
  });

  if (!agentMessage || !agentMessage.parentId || !agentMessage.agentMessageId) {
    return new Err(new Error("Agent message not found"));
  }

  // Query 2: Get the parent message's sId (which is the user message).
  const parentMessage = await Message.findOne({
    where: {
      id: agentMessage.parentId,
      conversationId: conversation.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    attributes: ["sId", "version"],
  });

  if (!parentMessage) {
    return new Err(new Error("User message not found"));
  }

  const blockedActions =
    await AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
      agentMessageId: agentMessage.agentMessageId,
    });

  if (blockedActions.length === 0) {
    return new Err(new Error("No blocked actions found"));
  }

  // Purge blocked actions event message from the stream:
  // - remove tool_approve_execution events (watch out as those events are not republished).
  // - remove tool_personal_auth_required events.
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);

    return isBlockedActionEvent(payload);
  }, getMessageChannelId(messageId));

  return new Ok({
    agentMessageId: agentMessage.sId,
    agentMessageVersion: agentMessage.version,
    lastStep: blockedActions[blockedActions.length - 1].stepContent.step,
    userMessageId: parentMessage.sId,
    userMessageVersion: parentMessage.version,
  });
}

export async function retryBlockedActions(
  auth: Authenticator,
  conversation: ConversationType,
  {
    messageId,
  }: {
    messageId: string;
  }
): Promise<Result<void, Error>> {
  const { sId: conversationId, title: conversationTitle } = conversation;

  const getUserMessageIdRes = await findUserMessageForRetry(
    auth,
    conversation,
    {
      messageId,
    }
  );

  if (getUserMessageIdRes.isErr()) {
    return getUserMessageIdRes;
  }

  const {
    agentMessageId,
    agentMessageVersion,
    lastStep,
    userMessageId,
    userMessageVersion,
  } = getUserMessageIdRes.value;

  const runAgentDataRes = await getRunAgentData(auth.toJSON(), {
    sync: false,
    idArgs: {
      agentMessageId,
      agentMessageVersion,
      conversationId,
      conversationTitle,
      userMessageId,
      userMessageVersion,
    },
  });

  if (runAgentDataRes.isErr()) {
    logger.error(
      {
        error: runAgentDataRes.error,
      },
      "Error getting run agent data"
    );

    return runAgentDataRes;
  }

  return runAgentLoop(
    auth,
    {
      sync: true,
      inMemoryData: runAgentDataRes.value,
    },
    {
      // Resume from the step where the action was created.
      startStep: lastStep,
    }
  );
}
