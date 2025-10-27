import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import type { AuthenticatorType } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { launchStoreAgentAnalyticsWorkflow } from "@app/temporal/analytics_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export type AgentUsageAnalyticsArgs = {
  type: "agent_message"
  message: AgentLoopArgs
} | {
  type: "agent_message_feedback"
  feedback: AgentMessageFeedbackType
  message: {
    agentMessageId: string;
    conversationId: string;
  }
}

/**
 * Launch agent message analytics workflow in fire-and-forget mode.
 */
export async function launchAgentMessageAnalyticsActivity(
  authType: AuthenticatorType,
  agentUsageAnalyticsArgs: AgentUsageAnalyticsArgs
): Promise<void> {
  // Use `getWorkspaceInfos` for lightweight workspace info.
  const owner = await getWorkspaceInfos(authType.workspaceId);
  if (!owner) {
    logger.warn(
      { workspaceId: authType.workspaceId },
      "Failed to fetch workspace infos for agent message analytics"
    );

    return;
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("agent_builder_observability")) {
    return;
  }

  const result = await launchStoreAgentAnalyticsWorkflow({
    authType,
    agentUsageAnalyticsArgs,
  });

  if (result.isErr()) {
    logger.warn(
      {
        agentMessageId: agentUsageAnalyticsArgs.message.agentMessageId,
        error: result.error,
        workspaceId: authType.workspaceId,
      },
      `Failed to launch ${agentUsageAnalyticsArgs.type} analytics workflow`
    );
  }
}
