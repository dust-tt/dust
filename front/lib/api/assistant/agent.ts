import assert from "assert";

import { ensureConversationTitle } from "@app/lib/api/assistant/conversation/title";
import type { AuthenticatorType } from "@app/lib/auth";
import { wakeLock } from "@app/lib/wake_lock";
import { runModelActivity } from "@app/temporal/agent_loop/activities/run_model";
import { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type { ModelId, RunAgentArgs } from "@app/types";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types";

const MAX_ACTIONS_PER_STEP = 16;

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// but it now handles updating it based on the execution results.
export async function runAgentWithStreaming(
  authType: AuthenticatorType,
  runAgentArgs: RunAgentArgs
): Promise<void> {
  const titlePromise = ensureConversationTitle(authType, runAgentArgs);

  // Citations references offset kept up to date across steps.
  let citationsRefsOffset = 0;

  const runIds: string[] = [];

  // Track step content IDs by function call ID for later use in actions.
  let functionCallStepContentIds: Record<string, ModelId> = {};

  await wakeLock(async () => {
    for (let i = 0; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
      const result = await runModelActivity({
        authType,
        runAgentArgs,
        runIds,
        step: i,
        functionCallStepContentIds,
        autoRetryCount: 0,
      });

      if (!result) {
        // Generation completed or error occurred
        return;
      }

      // Update state with results from runMultiActionsAgent
      runIds.push(result.runId);
      functionCallStepContentIds = result.functionCallStepContentIds;

      // We received the actions to run, but will enforce a limit on the number of actions (16)
      // which is very high. Over that the latency will just be too high. This is a guardrail
      // against the model outputting something unreasonable.
      const actionsToRun = result.actions.slice(0, MAX_ACTIONS_PER_STEP);

      const citationsIncrements = await Promise.all(
        actionsToRun.map(({ inputs, functionCallId }, index) =>
          runToolActivity(authType, {
            runAgentArgs,
            inputs,
            functionCallId,
            step: i,
            stepActionIndex: index,
            stepActions: actionsToRun.map((a) => a.action),
            citationsRefsOffset,
            stepContentId: functionCallStepContentIds[functionCallId],
          })
        )
      );

      citationsRefsOffset += citationsIncrements.reduce(
        (acc, curr) => acc + curr.citationsIncrement,
        0
      );
    }
  });

  await titlePromise;

  assert(authType.workspaceId, "Workspace ID is required");

  // It's fine to start the workflow here because the workflow will sleep for one hour before
  // computing usage.
  await launchUpdateUsageWorkflow({
    workspaceId: authType.workspaceId,
  });
}
