import { handleAgentMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { isAgentMessageType } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

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

  const conversationRes = await getConversation(
    auth,
    agentLoopArgs.conversationId
  );

  if (conversationRes.isErr()) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
        error: conversationRes.error,
      },
      "Failed to fetch conversation while handling mentions"
    );
    return;
  }

  const conversation = conversationRes.value;

  const agentMessage = conversation.content
    .flat()
    .find((message) => message.sId === agentLoopArgs.agentMessageId);

  if (!agentMessage) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "Agent message not found while handling mentions"
    );
    return;
  }

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
    conversation,
    agentMessage,
  });
}
