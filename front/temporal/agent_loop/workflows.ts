import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import type { ChildWorkflowHandle } from "@temporalio/workflow";
import {
  CancellationScope,
  proxyActivities,
  setHandler,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";

import {
  DEFAULT_MCP_REQUEST_TIMEOUT_MS,
  RETRY_ON_INTERRUPT_MAX_ATTEMPTS,
} from "@app/lib/actions/constants";
import type { AuthenticatorType } from "@app/lib/auth";
import type * as commonActivities from "@app/temporal/agent_loop/activities/common";
import type * as ensureTitleActivities from "@app/temporal/agent_loop/activities/ensure_conversation_title";
import type * as logAgentLoopMetricsActivities from "@app/temporal/agent_loop/activities/instrumentation";
import type * as publishDeferredEventsActivities from "@app/temporal/agent_loop/activities/publish_deferred_events";
import type * as runModelAndCreateWrapperActivities from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import type * as runToolActivities from "@app/temporal/agent_loop/activities/run_tool";
import type { AgentLoopActivities } from "@app/temporal/agent_loop/lib/activity_interface";
import { makeAgentLoopConversationTitleWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import { cancelAgentLoopSignal } from "@app/temporal/agent_loop/signals";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types";
import type {
  AgentLoopArgs,
  AgentLoopArgsWithTiming,
} from "@app/types/assistant/agent_run";

const toolActivityStartToCloseTimeout = `${DEFAULT_MCP_REQUEST_TIMEOUT_MS / 1000 / 60 + 1} minutes`;

const logMetricsActivities = proxyActivities<
  typeof logAgentLoopMetricsActivities
>({
  startToCloseTimeout: "30 seconds",
});

const activities: AgentLoopActivities = {
  runModelAndCreateActionsActivity: proxyActivities<
    typeof runModelAndCreateWrapperActivities
  >({
    startToCloseTimeout: "10 minutes",
  }).runModelAndCreateActionsActivity,
  runToolActivity: proxyActivities<typeof runToolActivities>({
    // Activity timeout keeps a short buffer above the tool timeout to detect worker restarts promptly.
    startToCloseTimeout: toolActivityStartToCloseTimeout,
    retry: {
      // Do not retry tool activities. Those are not idempotent.
      maximumAttempts: 1,
    },
  }).runToolActivity,
  runRetryableToolActivity: proxyActivities<typeof runToolActivities>({
    startToCloseTimeout: toolActivityStartToCloseTimeout,
    retry: {
      maximumAttempts: RETRY_ON_INTERRUPT_MAX_ATTEMPTS,
    },
  }).runToolActivity,
  publishDeferredEventsActivity: proxyActivities<
    typeof publishDeferredEventsActivities
  >({
    startToCloseTimeout: "2 minutes",
  }).publishDeferredEventsActivity,
  logAgentLoopPhaseStartActivity:
    logMetricsActivities.logAgentLoopPhaseStartActivity,
  logAgentLoopPhaseCompletionActivity:
    logMetricsActivities.logAgentLoopPhaseCompletionActivity,
  logAgentLoopStepCompletionActivity:
    logMetricsActivities.logAgentLoopStepCompletionActivity,
};

const { ensureConversationTitleActivity } = proxyActivities<
  typeof ensureTitleActivities
>({
  startToCloseTimeout: "5 minutes",
});

const { notifyWorkflowError, finalizeCancellationActivity } = proxyActivities<
  typeof commonActivities
>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 5,
  },
});

export async function agentLoopConversationTitleWorkflow({
  authType,
  agentLoopArgs,
}: {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgs;
}) {
  await ensureConversationTitleActivity(authType, agentLoopArgs);
}

export async function agentLoopWorkflow({
  authType,
  initialStartTime,
  agentLoopArgs,
  startStep,
}: {
  authType: AuthenticatorType;
  initialStartTime: number;
  agentLoopArgs: AgentLoopArgs;
  startStep: number;
}) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  let childWorkflowHandle: ChildWorkflowHandle<
    typeof agentLoopConversationTitleWorkflow
  > | null = null;

  // Allow cancellation of in-flight activities via signal-triggered scope cancellation.
  let cancelRequested = false;
  const executionScope = new CancellationScope();

  setHandler(cancelAgentLoopSignal, () => {
    cancelRequested = true;
    executionScope.cancel();
  });

  try {
    // If conversation title is not set, launch a child workflow to generate the conversation title in
    // the background. If a workflow with the same ID is already running, ignore the error and
    // continue. Do not wait for the child workflow to complete at this point.
    // This is to avoid blocking the main workflow.
    if (!agentLoopArgs.conversationTitle) {
      try {
        childWorkflowHandle = await startChild(
          agentLoopConversationTitleWorkflow,
          {
            workflowId: makeAgentLoopConversationTitleWorkflowId(
              authType,
              agentLoopArgs
            ),
            searchAttributes: parentSearchAttributes,
            args: [{ authType, agentLoopArgs }],
            memo,
          }
        );
      } catch (err) {
        if (!(err instanceof WorkflowExecutionAlreadyStartedError)) {
          throw err;
        }
      }
    }

    const { agentMessageId, conversationId } = agentLoopArgs;

    await executionScope.run(async () => {
      const runIds: string[] = [];
      const syncStartTime = Date.now();
      let currentStep = startStep;

      await activities.logAgentLoopPhaseStartActivity({
        authType,
        eventData: {
          agentMessageId,
          conversationId,
          startStep,
        },
      });

      for (let i = startStep; i < MAX_STEPS_USE_PER_RUN_LIMIT + 1; i++) {
        currentStep = i;

        const stepStartTime = Date.now();

        const { runId, shouldContinue } = await executeStepIteration({
          authType,
          agentLoopArgs: {
            ...agentLoopArgs,
            initialStartTime,
          },
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
          initialStartTime,
          stepsCompleted,
          syncStartTime,
        },
      });
    });

    if (childWorkflowHandle) {
      await childWorkflowHandle.result();
    }
  } catch (err) {
    const workflowError = err instanceof Error ? err : new Error(String(err));

    // Notify error in a non-cancellable scope to ensure it runs even if workflow is cancelled
    await CancellationScope.nonCancellable(async () => {
      if (cancelRequested) {
        // Run finalization tasks on cancellation (dummy for now).
        await finalizeCancellationActivity(authType, agentLoopArgs);
      } else {
        await notifyWorkflowError(authType, {
          conversationId: agentLoopArgs.conversationId,
          agentMessageId: agentLoopArgs.agentMessageId,
          agentMessageVersion: agentLoopArgs.agentMessageVersion,
          error: workflowError,
        });
      }
    });

    // If cancellation was explicitly requested via signal, finish gracefully without rethrowing.
    if (cancelRequested) {
      return;
    }

    throw err;
  }
}

async function executeStepIteration({
  activities,
  authType,
  currentStep,
  agentLoopArgs,
  runIds,
  startStep,
}: {
  activities: AgentLoopActivities;
  authType: AuthenticatorType;
  currentStep: number;
  agentLoopArgs: AgentLoopArgsWithTiming;
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
    runAgentArgs: agentLoopArgs,
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
            runAgentArgs: agentLoopArgs,
            step: currentStep,
            runIds: [...(runIds ?? []), ...(runId ? [runId] : [])],
          })
        : activities.runRetryableToolActivity(authType, {
            actionId,
            runAgentArgs: agentLoopArgs,
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
