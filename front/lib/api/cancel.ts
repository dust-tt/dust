import { updateAgentMessageWithFinalStatus } from "@app/lib/api/assistant/conversation";
import { fetchAgentMessageBySId } from "@app/lib/api/assistant/conversation/messages";
import { cancelMessageGenerationEvent } from "@app/lib/api/assistant/pubsub";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
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

  const failedIds = await cancelMessageGenerationEvent(auth, {
    messageIds,
    conversationId,
  });

  if (failedIds.length === 0) {
    return;
  }

  await concurrentExecutor(
    failedIds,
    async (messageId) => {
      const agentMessage = await fetchAgentMessageBySId(auth, {
        conversation,
        messageId,
      });

      if (!agentMessage) {
        logger.warn(
          { messageId, conversationId },
          "cancelMessageGeneration: agent message not found for failed signal, skipping fallback"
        );
        return;
      }

      if (agentMessage.status !== "created") {
        return;
      }

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "cancelled",
      });
    },
    { concurrency: 8 }
  );
}
