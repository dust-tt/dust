import { getWorkspaceInfos } from "@app/lib/api/workspace";
import type { AuthenticatorType } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { launchConversationUnreadNotificationWorkflow } from "@app/temporal/notifications_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Launch conversation unread notification activity.
 */
export async function conversationUnreadNotificationActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  // Use `getWorkspaceInfos` for lightweight workspace info.
  const owner = await getWorkspaceInfos(authType.workspaceId);
  if (!owner) {
    logger.warn(
      { workspaceId: authType.workspaceId },
      "Failed to fetch workspace infos for conversation unread notification"
    );
    return;
  }

  const result = await launchConversationUnreadNotificationWorkflow({
    authType,
    agentLoopArgs,
  });

  if (result.isErr()) {
    logger.warn(
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        error: result.error,
        workspaceId: authType.workspaceId,
      },
      "Failed to launch conversation unread notification workflow"
    );
  }
}
