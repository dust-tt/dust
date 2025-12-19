import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { triggerConversationUnreadNotifications } from "@app/lib/notifications/workflows/conversation-unread";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Activity to send conversation unread notifications.
 */
export async function sendUnreadConversationNotificationActivity(
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

  // Get conversation participants
  const conversation = await ConversationResource.fetchById(
    auth,
    agentLoopArgs.conversationId
  );

  if (!conversation) {
    logger.warn(
      { conversationId: agentLoopArgs.conversationId },
      "Conversation not found after delay"
    );
    return;
  }

  const r = await triggerConversationUnreadNotifications(auth, {
    conversation,
    messageId: agentLoopArgs.agentMessageId,
  });

  if (r.isErr()) {
    logger.error(
      { error: r.error },
      "Failed to trigger conversation unread notification"
    );
    return;
  }
}
