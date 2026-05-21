import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { launchStoreAgentAnalyticsWorkflow } from "@app/temporal/analytics_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Launch agent message analytics workflow in fire-and-forget mode.
 */
export async function launchAgentMessageAnalytics(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const result = await launchStoreAgentAnalyticsWorkflow({
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
      "Failed to launch agent message analytics workflow"
    );
  }
}
