import { isUserMessageOrigin } from "@app/components/agent_builder/observability/utils";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import {
  shouldSendNotificationForAgentAnswer,
  triggerConversationUnreadNotifications,
} from "@app/lib/notifications/workflows/conversation-unread";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { NOTIFICATION_DELAY_MS } from "@app/temporal/agent_loop/workflows";
import { isDevelopment } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Launch conversation unread notification activity.
 */
export async function conversationUnreadNotificationActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  // Contruct back an authenticator from the auth type.
  const auth = await Authenticator.fromJSON(authType);
  if (!auth) {
    logger.error(
      { authType },
      "Failed to construct authenticator from auth type"
    );
    return;
  }
  if (!isUserMessageOrigin(agentLoopArgs.userMessageOrigin)) {
    logger.info(
      { userMessageOrigin: agentLoopArgs.userMessageOrigin },
      "User message origin is not a valid origin."
    );
    return;
  }

  // Check if the user message origin is valid for sending notifications.
  if (!shouldSendNotificationForAgentAnswer(agentLoopArgs.userMessageOrigin)) {
    return;
  }

  // Check if the workspace has notifications enabled.
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  if (!featureFlags.includes("notifications")) {
    return;
  }

  // Wait 30 seconds before triggering the notification.
  await new Promise((resolve) =>
    setTimeout(resolve, isDevelopment() ? 3000 : NOTIFICATION_DELAY_MS)
  );

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
