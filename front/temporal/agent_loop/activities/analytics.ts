import type { AuthenticatorType } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { launchStoreAgentAnalyticsWorkflow } from "@app/temporal/analytics_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Launch agent message analytics workflow in fire-and-forget mode.
 */
export async function launchAgentMessageAnalyticsActivity(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const result = await launchStoreAgentAnalyticsWorkflow({
    authType,
    agentLoopArgs,
  });

  if (result.isErr()) {
    logger.warn(
      {
        workspaceId: authType.workspaceId,
        agentMessageId: agentLoopArgs.agentMessageId,
        error: result.error,
      },
      "Failed to launch agent message analytics workflow"
    );
  }
}
