import type { AuthenticatorType } from "@app/lib/auth";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";

import type { AgentLoopActivities } from "./activity_interface";

/**
 * Core agent loop executor that works with both Temporal workflows and direct execution.
 *
 * IMPORTANT: This code runs in Temporal workflows. Changes to this function affect workflow
 * versions and require careful migration planning for existing running workflows.
 */
export async function executeAgentLoop(
  authType: AuthenticatorType,
  runAgentArgs: RunAgentArgs,
  activities: AgentLoopActivities,
  startStep: number
): Promise<void> {
  const runIds: string[] = [];

  for (let i = startStep; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
    const result = await activities.runModelAndCreateActionsActivity({
      authType,
      runAgentArgs,
      runIds,
      step: i,
      autoRetryCount: 0,
    });

    if (!result) {
      // Generation completed or error occurred.
      return;
    }

    const { runId, actionBlobs } = result;

    // Update state with results.
    if (runId) {
      runIds.push(runId);
    }

    // If at least one action needs approval, we break out of the loop and will resume once all
    // actions have been approved.
    const needsApproval = actionBlobs.some((a) => a.needsApproval);
    if (needsApproval) {
      // Break the loop - workflow will be restarted externally once approved
      return;
    }

    // Execute tools.
    await Promise.all(
      actionBlobs.map(({ action }) =>
        activities.runToolActivity(authType, {
          actionId: action.id,
          runAgentArgs,
          step: i,
        })
      )
    );
  }
}
