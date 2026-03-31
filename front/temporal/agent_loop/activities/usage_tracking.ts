import { getWorkspaceInfos } from "@app/lib/api/workspace";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
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
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
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

  const result = await launchTrackProgrammaticUsageWorkflow({
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
      "Failed to launch agent message analytics workflow"
    );
  }
}

/**
 * Launch Metronome usage events workflow in fire-and-forget mode.
 * Gated by the `metronome_billing` feature flag — no workflow started if unset.
 */
export async function launchEmitMetronomeUsageEvents(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    return;
  }

  const enabled = await hasFeatureFlag(authResult.value, "metronome_billing");
  if (!enabled) {
    return;
  }

  const result = await launchEmitMetronomeUsageEventsWorkflow({
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
      "[Metronome] Failed to launch usage events workflow"
    );
  }
}
