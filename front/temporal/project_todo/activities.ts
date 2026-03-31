import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import logger from "@app/logger/logger";

export async function analyzeProjectTodosActivity({
  authType,
  conversationId,
  messageId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
}): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    logger.error(
      { conversationId, error: authResult.error },
      "Conversation todo: failed to deserialize authenticator"
    );
    return;
  }
  const auth = authResult.value;

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    logger.warn(
      { conversationId, error: conversationRes.error },
      "Conversation todo: conversation not found, skipping"
    );
    return;
  }

  const conversation = conversationRes.value;

  // Skip very short conversations.
  const messageCount = conversation.content.length;
  if (messageCount < 2) {
    return;
  }

  // TODO: call LLM to extract action items, key decisions, notable facts, and
  // agent suggestions from the conversation, then persist with:
  //   ConversationTodoVersionedResource.makeNew(auth, {
  //     conversationId: conversation.id,
  //     runId: <uuid>,
  //     topic: ...,
  //     actionItems: [...],
  //     notableFacts: [...],
  //     keyDecisions: [...],
  //     agentSuggestions: [...],
  //     lastRunAt: new Date(),
  //     lastProcessedMessageRank: <highest rank seen>,
  //   });
  logger.info(
    { conversationId, messageId, messageCount },
    "Conversation todo: analysis not yet implemented"
  );
}
