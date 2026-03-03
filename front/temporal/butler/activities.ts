import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import { analyzeConversation } from "@app/lib/butler/analyze_conversation";
import logger from "@app/logger/logger";

export async function analyzeConversationActivity({
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
      "Butler: failed to deserialize authenticator"
    );
    return;
  }
  const auth = authResult.value;

  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    logger.warn(
      { conversationId, error: conversationRes.error },
      "Butler: conversation not found, skipping"
    );
    return;
  }

  const conversation = conversationRes.value;

  // Skip test conversations (created when users test agents via the "test" button).
  if (conversation.visibility === "test") {
    return;
  }

  // Skip conversations without a title (title generation handles those).
  if (!conversation.title) {
    return;
  }

  // Skip very short conversations — the initial title is likely fine.
  const messageCount = conversation.content.length;
  if (messageCount < 4) {
    return;
  }

  await analyzeConversation(auth, {
    conversation,
    messageId,
  });
}
