import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator, type AuthenticatorType } from "@app/lib/auth";
import { analyzeConversationTodos } from "@app/lib/project_todo/analyze_conversation";
import logger from "@app/logger/logger";
import { Context } from "@temporalio/activity";

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
  if (conversation.content.length < 2) {
    return;
  }

  const { runId } = Context.current().info.workflowExecution;
  await analyzeConversationTodos(auth, { conversation, messageId, runId });
}
