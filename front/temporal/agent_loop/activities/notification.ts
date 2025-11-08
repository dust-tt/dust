import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { getNovuClient } from "@app/lib/notifications";
import type { ConversationUnreadPayloadType } from "@app/lib/notifications/workflows/conversation-unread";
import { CONVERSATION_UNREAD_TRIGGER_ID } from "@app/lib/notifications/workflows/conversation-unread";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { NOTIFICATION_DELAY_MS } from "@app/temporal/agent_loop/workflows";
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
      "Conversation not found"
    );
    return;
  }

  const participants = await conversation.listParticipants(auth, true);

  if (participants.length !== 0) {
    const payload: ConversationUnreadPayloadType = {
      conversationId: conversation.sId,
      conversationTitle: conversation.title ?? "A conversation",
      workspaceId: auth.getNonNullableWorkspace().sId,
    };
    try {
      const novuClient = await getNovuClient();
      await novuClient.bulkTrigger(
        participants.map((p) => ({
          name: CONVERSATION_UNREAD_TRIGGER_ID,
          to: { subscriberId: p.sId },
          payload,
        }))
      );
    } catch (error) {
      logger.error(
        { error },
        "Failed to trigger conversation unread notification"
      );
    }
  }
}
