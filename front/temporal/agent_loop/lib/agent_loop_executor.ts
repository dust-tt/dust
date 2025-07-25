import type { AuthenticatorType } from "@app/lib/auth";
import type { ModelId } from "@app/types";
import {
  MAX_ACTIONS_PER_STEP,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types/assistant/agent";
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
  activities: AgentLoopActivities
): Promise<void> {
  const runIds: string[] = [];

  // Track step content IDs by function call ID for later use in actions.
  let functionCallStepContentIds: Record<string, ModelId> = {};

  for (let i = 0; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
    const result = await activities.runModelActivity({
      authType,
      runAgentArgs,
      runIds,
      step: i,
      functionCallStepContentIds,
      autoRetryCount: 0,
    });

    if (!result) {
      // Generation completed or error occurred.
      return;
    }

    const { runId, stepContexts } = result;

    // Update state with results from runMultiActionsAgent.
    runIds.push(runId);
    functionCallStepContentIds = result.functionCallStepContentIds;

    // We received the actions to run, but will enforce a limit on the number of actions
    // which is very high. Over that the latency will just be too high. This is a guardrail
    // against the model outputting something unreasonable.
    const actionsToRun = result.actions.slice(0, MAX_ACTIONS_PER_STEP);

    await Promise.all(
      actionsToRun.map(({ functionCallId, action }, index) =>
        activities.runToolActivity(authType, {
          runAgentArgs,
          action,
          stepContext: stepContexts[index],
          stepContentId: functionCallStepContentIds[functionCallId],
        })
      )
    );
  }
}
