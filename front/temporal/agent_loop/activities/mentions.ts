import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { launchHandleMentionsWorkflow } from "@app/temporal/mentions_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Launch mentions workflow in fire-and-forget mode.
 */
export async function handleMentions(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const result = await launchHandleMentionsWorkflow({
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
      "Failed to launch mentions workflow"
    );
  }
}
