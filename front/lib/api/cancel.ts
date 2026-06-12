import { updateAgentMessageWithFinalStatus } from "@app/lib/api/assistant/conversation";
import { batchRenderAgentMessages } from "@app/lib/api/assistant/messages";
import {
  cancelAgentLoop,
  interruptAgentLoop,
} from "@app/lib/api/assistant/pubsub";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";

export async function terminateMessageGeneration(
  auth: Authenticator,
  {
    messageIds,
    conversationId,
    action,
  }: {
    messageIds: string[];
    conversationId: string;
    action: "cancel" | "interrupt";
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
      "terminateMessageGeneration: conversation not found, skipping"
    );
    return;
  }

  const conversation = conversationRes.value;
  const status = action === "interrupt" ? "interrupted" : "cancelled";
  const signalFn =
    action === "interrupt" ? interruptAgentLoop : cancelAgentLoop;

  const { failedMessageIds } = await signalFn(auth, {
    messageIds,
    conversationId,
  });

  if (failedMessageIds.length === 0) {
    return;
  }

  // Fallback for messages whose workflow couldn't be signalled: mark them directly
  // so they don't stay stuck in "created" state.
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
        "terminateMessageGeneration: agent message not found for failed signal, skipping fallback"
      );
    }
  }

  const agentMessagesRes = await batchRenderAgentMessages(
    auth,
    messageRows,
    "full",
    null,
    new Map()
  );

  if (agentMessagesRes.isErr()) {
    logger.error(
      { conversationId, error: agentMessagesRes.error },
      "terminateMessageGeneration: failed to render agent messages"
    );
    return;
  }

  for (const agentMessage of agentMessagesRes.value) {
    if (agentMessage.status !== "created") {
      continue;
    }

    const result = await updateAgentMessageWithFinalStatus(auth, {
      conversation,
      agentMessage,
      status,
    });

    // The status check above reads a snapshot: the message may have been finalized between the
    // render and the update. Don't publish a stale terminal event in that case.
    if (!result.applied) {
      continue;
    }

    await publishConversationRelatedEvent({
      event: {
        type: "agent_generation_cancelled",
        created: Date.now(),
        configurationId: agentMessage.configuration.sId,
        messageId: agentMessage.sId,
        status,
      },
      conversationId: conversation.sId,
      step: agentMessage.contents.reduce((max, c) => Math.max(max, c.step), 0),
    });
  }
}
