import { handleAgentMessage } from "@app/lib/api/assistant/conversation";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { isAgentMessageType } from "@app/types/assistant/conversation";

/**
 * Handle mentions in the agent message content.
 */
export async function handleMentionsActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;

  const conversation = await ConversationResource.fetchById(
    auth,
    agentLoopArgs.conversationId
  );

  if (!conversation) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "Failed to fetch conversation while handling mentions"
    );
    return;
  }

  const mRes = await conversation.getMessageById(
    auth,
    agentLoopArgs.agentMessageId
  );
  if (mRes.isErr()) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
        error: mRes.error,
      },
      "Agent message not found while handling mentions"
    );
    return;
  }

  const message = mRes.value;

  if (!message.agentMessageId) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "Message is not an agent message while handling mentions"
    );
    return;
  }

  const result = await batchRenderMessages(
    auth,
    conversation,
    [message], // Only pass the agent message, not the parent
    "full"
  );

  if (result.isErr()) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
        error: result.error,
      },
      "Failed to render messages while handling mentions"
    );
    return;
  }

  const agentMessage = result.value[0];

  // To please the type checker.
  if (!isAgentMessageType(agentMessage)) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "Message is not an agent message while handling mentions"
    );
    return;
  }

  if (!agentMessage.content) {
    return;
  }

  if (agentMessage.status !== "succeeded") {
    return;
  }

  await handleAgentMessage(auth, {
    conversation: conversation.toJSON(),
    agentMessage,
  });
}
