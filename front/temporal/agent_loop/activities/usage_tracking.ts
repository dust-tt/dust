import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import {
  launchEmitMetronomeUsageEventsWorkflow,
  launchTrackProgrammaticUsageWorkflow,
} from "@app/temporal/usage_queue/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { isCreditPricedPlan } from "@app/types/plan";

/**
 * Launch agent message analytics workflow in fire-and-forget mode.
 * Credit-priced (Metronome) plans bypass this entirely: consumption is tracked
 * through `launchEmitMetronomeUsageEvents`, and there are no legacy credit rows
 * to decrement or excess rows to create.
 */
export async function launchTrackProgrammaticUsage(
  auth: Authenticator,
  agentLoopArgs: AgentLoopArgs
): Promise<void> {
  const plan = auth.subscription()?.plan;
  if (plan && isCreditPricedPlan(plan)) {
    return;
  }

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
