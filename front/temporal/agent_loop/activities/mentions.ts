import { handleAgentMessage } from "@app/lib/api/assistant/conversation";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
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
  // Contruct back an authenticator from the auth type.
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

  const conversationResource = await ConversationResource.fetchById(
    auth,
    agentLoopArgs.conversationId
  );
  if (!conversationResource) {
    logger.warn(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "Conversation not found while handling mentions"
    );
    return;
  }

  const messageRes = await conversationResource.getMessageById(
    auth,
    agentLoopArgs.agentMessageId
  );

  if (messageRes.isErr()) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
        error: messageRes.error,
      },
      "Failed to fetch agent message while handling mentions"
    );
    return;
  }

  const renderMessageRes = await batchRenderMessages(
    auth,
    conversationResource,
    [messageRes.value],
    "full"
  );

  if (renderMessageRes.isErr()) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
        error: renderMessageRes.error,
      },
      "Failed to batch render agent messages while handling mentions"
    );
    return;
  }
  if (renderMessageRes.value.length !== 1) {
    logger.error(
      {
        conversationId: agentLoopArgs.conversationId,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "Unexpected number of messages post render processing while handling mentions"
    );
    return;
  }

  const agentMessage = renderMessageRes.value[0];
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

  const conversation = conversationResource.toJSON();
  await handleAgentMessage(auth, {
    conversation,
    agentMessage,
  });
}
