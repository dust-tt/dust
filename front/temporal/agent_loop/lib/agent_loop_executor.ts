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
    if (runAgentArgs.sync && runAgentArgs.syncToAsyncTimeoutMs) {
      const elapsedMs = Date.now() - syncStartTime;
      if (elapsedMs > runAgentArgs.syncToAsyncTimeoutMs) {
        throw new SyncTimeoutError({ currentStep, elapsedMs });
      }
    }

    const result = await activities.runModelAndCreateActionsActivity({
      authType,
      autoRetryCount: 0,
      checkForResume: i === startStep, // Only run resume the first time.
      runAgentArgs,
      runIds,
      step: i,
    });

    if (!result) {
      // Generation completed or error occurred.
      break;
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
      // Break the loop - workflow will be restarted externally once approved.
      await activities.logAgentLoopPhaseCompletionActivity({
        authType,
        eventData: {
          agentMessageId,
          conversationId,
          executionMode: runAgentArgs.sync ? "sync" : "async",
          initialStartTime: runAgentArgs.initialStartTime,
          stepsCompleted: currentStep - startStep,
          syncStartTime,
        },
      });

      return;
    }

    // Execute tools.
    await Promise.all(
      actionBlobs.map(({ actionId }) =>
        activities.runToolActivity(authType, {
          actionId,
          runAgentArgs,
          step: i,
        })
      )
    );
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
