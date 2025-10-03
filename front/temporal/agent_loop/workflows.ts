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
import { executeAgentLoop } from "@app/temporal/agent_loop/lib/agent_loop_executor";
import { makeAgentLoopConversationTitleWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import { cancelAgentLoopSignal } from "@app/temporal/agent_loop/signals";
import type {
  RunAgentArgs,
  RunAgentAsynchronousArgs,
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

export async function agentLoopConversationTitleWorkflow({
  authType,
  runAsynchronousAgentArgs,
}: {
  authType: AuthenticatorType;
  runAsynchronousAgentArgs: RunAgentAsynchronousArgs;
}) {
  const runAgentArgs: RunAgentArgs = {
    sync: false,
    idArgs: runAsynchronousAgentArgs,
    initialStartTime: 0,
  };

  await ensureConversationTitleActivity(authType, runAgentArgs);
}

export async function agentLoopWorkflow({
  authType,
  initialStartTime,
  runAsynchronousAgentArgs,
  startStep,
}: {
  authType: AuthenticatorType;
  initialStartTime: number;
  runAsynchronousAgentArgs: RunAgentAsynchronousArgs;
  startStep: number;
}) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const runAgentArgs: RunAgentArgs = {
    sync: false,
    idArgs: runAsynchronousAgentArgs,
    initialStartTime,
  };

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
    if (!runAsynchronousAgentArgs.conversationTitle) {
      try {
        childWorkflowHandle = await startChild(
          agentLoopConversationTitleWorkflow,
          {
            workflowId: makeAgentLoopConversationTitleWorkflowId(
              authType,
              runAsynchronousAgentArgs
            ),
            searchAttributes: parentSearchAttributes,
            args: [{ authType, runAsynchronousAgentArgs }],
            memo,
          }
        );
      } catch (err) {
        if (!(err instanceof WorkflowExecutionAlreadyStartedError)) {
          throw err;
        }
      }
    }

    // In Temporal workflows, we don't pass syncStartTime since async execution doesn't need timeout.
    await executionScope.run(async () => {
      await executeAgentLoop(authType, runAgentArgs, activities, {
        startStep,
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
        await finalizeCancellationActivity(authType, runAsynchronousAgentArgs);
      } else {
        await notifyWorkflowError(authType, {
          conversationId: runAsynchronousAgentArgs.conversationId,
          agentMessageId: runAsynchronousAgentArgs.agentMessageId,
          agentMessageVersion: runAsynchronousAgentArgs.agentMessageVersion,
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
