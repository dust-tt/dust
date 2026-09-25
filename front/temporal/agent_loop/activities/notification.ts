import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { launchConversationUnreadNotificationWorkflow } from "@app/temporal/notifications_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Launch conversation unread notification activity.
 */
export async function conversationUnreadNotification(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const result = await launchConversationUnreadNotificationWorkflow({
    authType: auth.toJSON(),
    agentLoopArgs,
  });

  if (result.isErr()) {
    logger.warn(
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        error: result.error,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Failed to launch conversation unread notification workflow"
    );
  }
}
