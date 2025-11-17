import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { getNovuClient } from "@app/lib/notifications";
import type { ConversationUnreadPayloadType } from "@app/lib/notifications/workflows/conversation-unread";
import {
  CONVERSATION_UNREAD_TRIGGER_ID,
  shouldSendNotification,
} from "@app/lib/notifications/workflows/conversation-unread";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { NOTIFICATION_DELAY_MS } from "@app/temporal/agent_loop/workflows";
import { isUserMessageOrigin } from "@app/types";
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
  if (!shouldSendNotification(agentLoopArgs.userMessageOrigin)) {
    return;
  }

  // Check if the workspace has notifications enabled.
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  if (!featureFlags.includes("notifications")) {
    return;
  }

  // Wait 30 seconds before triggering the notification.
  await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_DELAY_MS));

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

  // Skip any sub-conversations.
  if (conversation.depth > 0) {
    return;
  }

  const participants = await conversation.listParticipants(auth, true);

  if (participants.length !== 0) {
    try {
      const novuClient = await getNovuClient();

      await novuClient.bulkTrigger(
        participants.map((p) => {
          const payload: ConversationUnreadPayloadType = {
            conversationId: conversation.sId,
            workspaceId: auth.getNonNullableWorkspace().sId,
            userId: p.sId,
            messageId: agentLoopArgs.agentMessageId,
          };
          return {
            name: CONVERSATION_UNREAD_TRIGGER_ID,
            to: {
              subscriberId: p.sId,
              email: p.email,
              firstName: p.firstName ?? undefined,
              lastName: p.lastName ?? undefined,
            },
            payload,
          };
        })
      );
    } catch (error) {
      logger.error(
        { error },
        "Failed to trigger conversation unread notification"
      );
    }
  }
}
