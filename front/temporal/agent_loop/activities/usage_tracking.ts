import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import {
  launchEmitMetronomeUsageEventsWorkflow,
  launchTrackProgrammaticUsageWorkflow,
} from "@app/temporal/usage_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

/**
 * Launch agent message analytics workflow in fire-and-forget mode.
 */
export async function launchTrackProgrammaticUsage(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const result = await launchTrackProgrammaticUsageWorkflow({
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

/**
 * Launch Metronome usage events workflow in fire-and-forget mode.
 * Only starts if the workspace has a metronomeCustomerId (i.e. is provisioned in Metronome).
 */
export async function launchEmitMetronomeUsageEvents(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  if (!auth.getNonNullableWorkspace().metronomeCustomerId) {
    return;
  }

  const result = await launchEmitMetronomeUsageEventsWorkflow({
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
      "[Metronome] Failed to launch usage events workflow"
    );
  }
}
