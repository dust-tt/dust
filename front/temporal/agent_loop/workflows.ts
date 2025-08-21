import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import type { ChildWorkflowHandle } from "@temporalio/workflow";
import {
  proxyActivities,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as ensureTitleActivities from "@app/temporal/agent_loop/activities/ensure_conversation_title";
import type * as logAgentLoopMetricsActivities from "@app/temporal/agent_loop/activities/instrumentation";
import type * as publishDeferredEventsActivities from "@app/temporal/agent_loop/activities/publish_deferred_events";
import type * as runModelAndCreateWrapperActivities from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import type * as runToolActivities from "@app/temporal/agent_loop/activities/run_tool";
import type { AgentLoopActivities } from "@app/temporal/agent_loop/lib/activity_interface";
import { executeAgentLoop } from "@app/temporal/agent_loop/lib/agent_loop_executor";
import { makeAgentLoopConversationTitleWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import type {
  RunAgentArgs,
  RunAgentAsynchronousArgs,
} from "@app/types/assistant/agent_run";

const logMetricsActivities = proxyActivities<
  typeof logAgentLoopMetricsActivities
>({
  startToCloseTimeout: "30 seconds",
});

const activities: AgentLoopActivities = {
  runModelAndCreateActionsActivity: proxyActivities<
    typeof runModelAndCreateWrapperActivities
  >({
    startToCloseTimeout: "7 minutes",
  }).runModelAndCreateActionsActivity,
  runToolActivity: proxyActivities<typeof runToolActivities>({
    startToCloseTimeout: "10 minutes",
    retry: {
      // Do not retry tool activities. Those are not idempotent.
      maximumAttempts: 1,
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
  await executeAgentLoop(authType, runAgentArgs, activities, {
    startStep,
  });

  if (childWorkflowHandle) {
    await childWorkflowHandle.result();
  }
}
