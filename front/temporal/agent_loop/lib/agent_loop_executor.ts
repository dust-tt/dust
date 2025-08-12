import type { AgentLoopMaybeContinueAsync } from "@app/lib/actions/types";
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
  activities: AgentLoopActivities,
  startStep: number
): Promise<AgentLoopMaybeContinueAsync> {
  const runIds: string[] = [];
  const startTime = Date.now();

  // Track step content IDs by function call ID for later use in actions.
  let functionCallStepContentIds: Record<string, ModelId> = {};

  for (let i = startStep; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
    // Auto-switch from sync to async mode after 2 minutes.
    if (
      runAgentArgs.sync &&
      runAgentArgs.autoSwitchAsyncAfterMs &&
      Date.now() - startTime > runAgentArgs.autoSwitchAsyncAfterMs
    ) {
      return {
        resumeAsyncFromStep: i,
      };
    }

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

    const { actions, runId, stepContexts } = result;

    // We received the actions to run, but will enforce a limit on the number of actions
    // which is very high. Over that the latency will just be too high. This is a guardrail
    // against the model outputting something unreasonable.
    const actionsToRun = actions.slice(0, MAX_ACTIONS_PER_STEP);

    // Update state with results.
    runIds.push(runId);
    functionCallStepContentIds = result.functionCallStepContentIds;

    // Create tool actions and check if any of them need approval.
    const { actionBlobs } = await activities.createToolActionsActivity(
      authType,
      {
        runAgentArgs,
        actions: actionsToRun,
        stepContexts,
        functionCallStepContentIds,
        step: i,
      }
    );

    // Execute tools.
    await Promise.all(
      actionBlobs.map(
        ({ action, actionBaseParams, actionConfiguration, mcpAction }, index) =>
          activities.runToolActivity(authType, {
            runAgentArgs,
            rawAction: action,
            actionBaseParams,
            actionConfiguration,
            rawMcpAction: mcpAction,
            step: i,
            stepContext: stepContexts[index],
          })
      )
    );
  }
}
