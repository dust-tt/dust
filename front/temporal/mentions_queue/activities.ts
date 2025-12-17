import { handleAgentMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
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
  // Construct back an authenticator from the auth type.
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    logger.error(
      { authType, error: authResult.error },
      "Failed to construct authenticator from auth type"
    );
    return;
  }
  const auth = authResult.value;

  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  if (!featureFlags.includes("mentions_v2")) {
    return;
  }

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
