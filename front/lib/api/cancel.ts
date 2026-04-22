import { updateAgentMessageWithFinalStatus } from "@app/lib/api/assistant/conversation";
import { batchRenderAgentMessages } from "@app/lib/api/assistant/messages";
import { cancelMessageGenerationEvent } from "@app/lib/api/assistant/pubsub";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";

export async function cancelMessageGeneration(
  auth: Authenticator,
  {
    messageIds,
    conversationId,
  }: {
    messageIds: string[];
    conversationId: string;
  }
): Promise<void> {
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    logger.warn(
      { conversationId, error: conversationRes.error },
      "cancelMessageGeneration: conversation not found, skipping fallback"
    );
    return;
  }

  const conversation = conversationRes.value;

  const { failedMessageIds } = await cancelMessageGenerationEvent(auth, {
    messageIds,
    conversationId,
  });

  if (failedMessageIds.length === 0) {
    return;
  }

  const messageRows = await ConversationResource.getMessageByIds(
    auth,
    conversation,
    failedMessageIds
  );

  const foundMessageIds = new Set(messageRows.map((m) => m.sId));
  for (const messageId of failedMessageIds) {
    if (!foundMessageIds.has(messageId)) {
      logger.warn(
        { messageId, conversationId },
        "cancelMessageGeneration: agent message not found for failed signal, skipping fallback"
      );
    }
  }

  const agentMessagesRes = await batchRenderAgentMessages(
    auth,
    messageRows,
    "full"
  );

  if (agentMessagesRes.isErr()) {
    logger.error(
      { conversationId, error: agentMessagesRes.error },
      "cancelMessageGeneration: failed to render agent messages"
    );
    return;
  }

  for (const agentMessage of agentMessagesRes.value) {
    if (agentMessage.status !== "created") {
      continue;
    }

    await updateAgentMessageWithFinalStatus(auth, {
      conversation,
      agentMessage,
      status: "cancelled",
    });

    await publishConversationRelatedEvent({
      event: {
        type: "agent_generation_cancelled",
        created: Date.now(),
        configurationId: agentMessage.configuration.sId,
        messageId: agentMessage.sId,
      },
      conversationId: conversation.sId,
      step: 0,
    });
  }
}
