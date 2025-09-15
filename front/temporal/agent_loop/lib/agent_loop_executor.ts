import type { AuthenticatorType } from "@app/lib/auth";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";

import type { AgentLoopActivities } from "./activity_interface";

export class SyncTimeoutError extends Error {
  public readonly currentStep: number;
  public readonly elapsedMs: number;

  constructor({
    currentStep,
    elapsedMs,
  }: {
    currentStep: number;
    elapsedMs: number;
  }) {
    super(
      `Sync execution timeout reached at step ${currentStep} after ${elapsedMs}ms`
    );

    this.name = "SyncTimeoutError";
    this.currentStep = currentStep;
    this.elapsedMs = elapsedMs;
  }
}

async function executeStepIteration({
  activities,
  authType,
  currentStep,
  runAgentArgs,
  runIds,
  startStep,
}: {
  activities: AgentLoopActivities;
  authType: AuthenticatorType;
  currentStep: number;
  runAgentArgs: RunAgentArgs;
  runIds: string[];
  startStep: number;
}): Promise<{
  runId: string | null;
  shouldContinue: boolean;
}> {
  const result = await activities.runModelAndCreateActionsActivity({
    authType,
    autoRetryCount: 0,
    checkForResume: currentStep === startStep, // Only run resume the first time.
    runAgentArgs,
    runIds,
    step: currentStep,
  });

  if (!result) {
    // Generation completed or error occurred.
    return {
      runId: null,
      shouldContinue: false,
    };
  }

  const { runId, actionBlobs } = result;

  // If at least one action needs approval, we break out of the loop and will resume once all
  // actions have been approved.
  const needsApproval = actionBlobs.some((a) => a.needsApproval);
  if (needsApproval) {
    return {
      runId,
      shouldContinue: false,
    };
  }

  // Execute tools and collect any deferred events.
  const toolResults = await Promise.all(
    actionBlobs.map(({ actionId, retryPolicy }) =>
      retryPolicy === "no_retry"
        ? activities.runToolActivity(authType, {
            actionId,
            runAgentArgs,
            step: currentStep,
            runIds: [...(runIds ?? []), ...(runId ? [runId] : [])],
          })
        : activities.runRetryableToolActivity(authType, {
            actionId,
            runAgentArgs,
            step: currentStep,
            runIds: [...(runIds ?? []), ...(runId ? [runId] : [])],
          })
    )
  );

  // Collect all deferred events from tool executions.
  const allDeferredEvents = toolResults.flatMap(
    (result) => result.deferredEvents
  );

  // If there are deferred events, publish them after all tools have completed.
  if (allDeferredEvents.length > 0) {
    const shouldPauseWorkflow =
      await activities.publishDeferredEventsActivity(allDeferredEvents);

    if (shouldPauseWorkflow) {
      // Break the loop - workflow will be restarted externally once required action is completed.
      return {
        runId,
        shouldContinue: false,
      };
    }
  }

  return {
    runId,
    shouldContinue: !toolResults.some((result) => result.shouldPauseAgentLoop),
  };
}

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
  {
    startStep,
  }: {
    startStep: number;
  }
): Promise<void> {
  const runIds: string[] = [];
  const syncStartTime = Date.now();
  let currentStep = startStep;

  const conversationId = runAgentArgs.sync
    ? runAgentArgs.inMemoryData.conversation.sId
    : runAgentArgs.idArgs.conversationId;
  const agentMessageId = runAgentArgs.sync
    ? runAgentArgs.inMemoryData.agentMessage.sId
    : runAgentArgs.idArgs.agentMessageId;

  await activities.logAgentLoopPhaseStartActivity({
    authType,
    eventData: {
      agentMessageId,
      conversationId,
      executionMode: runAgentArgs.sync ? "sync" : "async",
      startStep,
    },
  });

  for (let i = startStep; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
    currentStep = i;

    // Check if we should switch to async mode due to timeout (only in sync mode).
    if (runAgentArgs.sync /* && runAgentArgs.syncToAsyncTimeoutMs */) {
      const elapsedMs = Date.now() - syncStartTime;
      // if (elapsedMs > runAgentArgs.syncToAsyncTimeoutMs) {
      // TODO(DURABLE_AGENT 2025-08-22): Remove this once we made a decision on sync vs async.
      throw new SyncTimeoutError({ currentStep, elapsedMs });
      // }
    }

    const stepStartTime = Date.now();

    const { runId, shouldContinue } = await executeStepIteration({
      authType,
      runAgentArgs,
      activities,
      currentStep,
      runIds,
      startStep,
    });

    // Update state with results.
    if (runId) {
      runIds.push(runId);
    }

    await activities.logAgentLoopStepCompletionActivity({
      agentMessageId,
      conversationId,
      executionMode: runAgentArgs.sync ? "sync" : "async",
      step: currentStep,
      stepStartTime,
    });

    if (!shouldContinue) {
      break;
    }
  }

  const stepsCompleted = currentStep - startStep;

  await activities.logAgentLoopPhaseCompletionActivity({
    authType,
    eventData: {
      agentMessageId,
      conversationId,
      executionMode: runAgentArgs.sync ? "sync" : "async",
      initialStartTime: runAgentArgs.initialStartTime,
      stepsCompleted,
      syncStartTime,
    },
  });
}
