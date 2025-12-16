import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import type {
  ChildWorkflowHandle,
  WorkflowInterceptorsFactory,
} from "@temporalio/workflow";
import {
  CancellationScope,
  patched,
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
import type * as analyticsActivities from "@app/temporal/agent_loop/activities/analytics";
import type * as commonActivities from "@app/temporal/agent_loop/activities/common";
import type * as ensureTitleActivities from "@app/temporal/agent_loop/activities/ensure_conversation_title";
import type * as finalizeActivities from "@app/temporal/agent_loop/activities/finalize";
import type * as instrumentationActivities from "@app/temporal/agent_loop/activities/instrumentation";
import type * as mentionsActivities from "@app/temporal/agent_loop/activities/mentions";
import type * as notificationActivities from "@app/temporal/agent_loop/activities/notification";
import type * as publishDeferredEventsActivities from "@app/temporal/agent_loop/activities/publish_deferred_events";
import type * as runModelAndCreateWrapperActivities from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import type * as runToolActivities from "@app/temporal/agent_loop/activities/run_tool";
import type * as usageTrackingActivities from "@app/temporal/agent_loop/activities/usage_tracking";
import { makeAgentLoopConversationTitleWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import { cancelAgentLoopSignal } from "@app/temporal/agent_loop/signals";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import type {
  AgentLoopArgs,
  AgentLoopArgsWithTiming,
} from "@app/types/assistant/agent_run";

const toolActivityStartToCloseTimeout = `${DEFAULT_MCP_REQUEST_TIMEOUT_MS / 1000 / 60 + 1} minutes`;
export const TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS = 60_000;
export const NOTIFICATION_DELAY_MS = 30000;

import {
  OpenTelemetryInboundInterceptor,
  OpenTelemetryInternalsInterceptor,
  OpenTelemetryOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/workflow";

// Export an interceptors variable to add OpenTelemetry interceptors to the workflow.
export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [new OpenTelemetryInboundInterceptor()],
  outbound: [new OpenTelemetryOutboundInterceptor()],
  internals: [new OpenTelemetryInternalsInterceptor()],
});

const { runModelAndCreateActionsActivity } = proxyActivities<
  typeof runModelAndCreateWrapperActivities
>({
  startToCloseTimeout: "5 minutes",
});

const { runToolActivity } = proxyActivities<typeof runToolActivities>({
  // Activity timeout keeps a short buffer above the tool timeout to detect worker restarts promptly.
  startToCloseTimeout: toolActivityStartToCloseTimeout,
  heartbeatTimeout: TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
  retry: {
    // Do not retry tool activities. Those are not idempotent.
    maximumAttempts: 1,
  },
});

const { runToolActivity: runRetryableToolActivity } = proxyActivities<
  typeof runToolActivities
>({
  startToCloseTimeout: toolActivityStartToCloseTimeout,
  heartbeatTimeout: TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
  retry: {
    maximumAttempts: RETRY_ON_INTERRUPT_MAX_ATTEMPTS,
  },
});

const { publishDeferredEventsActivity } = proxyActivities<
  typeof publishDeferredEventsActivities
>({
  startToCloseTimeout: "2 minutes",
});

const {
  logAgentLoopPhaseStartActivity,
  logAgentLoopPhaseCompletionActivity,
  logAgentLoopStepCompletionActivity,
} = proxyActivities<typeof instrumentationActivities>({
  startToCloseTimeout: "30 seconds",
});

const { launchAgentMessageAnalyticsActivity } = proxyActivities<
  typeof analyticsActivities
>({
  startToCloseTimeout: "30 seconds",
});

const { conversationUnreadNotificationActivity } = proxyActivities<
  typeof notificationActivities
>({
  startToCloseTimeout: "3 minutes",
  heartbeatTimeout: `${Math.ceil((NOTIFICATION_DELAY_MS * 2) / 1000)} seconds`,
  retry: {
    maximumAttempts: 1,
  },
});

const { handleMentionsActivity } = proxyActivities<typeof mentionsActivities>({
  startToCloseTimeout: "3 minutes",
});

const { ensureConversationTitleActivity } = proxyActivities<
  typeof ensureTitleActivities
>({
  startToCloseTimeout: "5 minutes",
  retry: {
    // Retry twice and fail given non criticality. The activity will fail if the conversation gets
    // deleted before it gets to title generation.
    maximumAttempts: 3,
  },
});

const { notifyWorkflowError, finalizeCancellationActivity } = proxyActivities<
  typeof commonActivities
>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 5,
  },
});

const { trackProgrammaticUsageActivity } = proxyActivities<
  typeof usageTrackingActivities
>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 5,
  },
});

const {
  finalizeSuccessfulAgentLoopActivity,
  finalizeCancelledAgentLoopActivity,
  finalizeErroredAgentLoopActivity,
} = proxyActivities<typeof finalizeActivities>({
  startToCloseTimeout: "5 minutes",
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

      await logAgentLoopPhaseStartActivity({
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
          currentStep,
          runIds,
          startStep,
        });

        // Update state with results.
        if (runId) {
          runIds.push(runId);
        }

        await logAgentLoopStepCompletionActivity({
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

      await logAgentLoopPhaseCompletionActivity({
        authType,
        eventData: {
          agentMessageId,
          conversationId,
          initialStartTime,
          stepsCompleted,
          syncStartTime,
        },
      });

      // Ensure analytics runs even if workflow is cancelled
      await CancellationScope.nonCancellable(async () => {
        if (patched("finalize-activity-consolidation")) {
          await finalizeAgentLoopActivity(authType, agentLoopArgs);
        } else {
          await Promise.all([
            launchAgentMessageAnalyticsActivity(authType, agentLoopArgs),
            trackProgrammaticUsageActivity(authType, agentLoopArgs),
            conversationUnreadNotificationActivity(authType, agentLoopArgs),
            handleMentionsActivity(authType, agentLoopArgs),
          ]);
        }
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
        // Ensure analytics runs even when workflow is cancelled
        if (patched("finalize-activity-consolidation")) {
          await finalizeCancelledAgentLoopActivity(authType, agentLoopArgs);
        } else {
          await Promise.all([
            launchAgentMessageAnalyticsActivity(authType, agentLoopArgs),
            trackProgrammaticUsageActivity(authType, agentLoopArgs),
            finalizeCancellationActivity(authType, agentLoopArgs),
          ]);
        }
        return;
      } else {
        // Ensure analytics runs even when workflow errors
        if (patched("finalize-activity-consolidation")) {
          await finalizeErroredAgentLoopActivity(
            authType,
            agentLoopArgs,
            workflowError
          );
        } else {
          await Promise.all([
            launchAgentMessageAnalyticsActivity(authType, agentLoopArgs),
            trackProgrammaticUsageActivity(authType, agentLoopArgs),
            notifyWorkflowError(authType, {
              conversationId: agentLoopArgs.conversationId,
              agentMessageId: agentLoopArgs.agentMessageId,
              agentMessageVersion: agentLoopArgs.agentMessageVersion,
              error: workflowError,
            }),
          ]);
        }
      }
      throw err;
    });
  }
}

async function executeStepIteration({
  authType,
  currentStep,
  agentLoopArgs,
  runIds,
  startStep,
}: {
  authType: AuthenticatorType;
  currentStep: number;
  agentLoopArgs: AgentLoopArgsWithTiming;
  runIds: string[];
  startStep: number;
}): Promise<{
  runId: string | null;
  shouldContinue: boolean;
}> {
  const result = await runModelAndCreateActionsActivity({
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
        ? runToolActivity(authType, {
            actionId,
            runAgentArgs: agentLoopArgs,
            step: currentStep,
            runIds: [...(runIds ?? []), ...(runId ? [runId] : [])],
          })
        : runRetryableToolActivity(authType, {
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
      await publishDeferredEventsActivity(allDeferredEvents);

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
