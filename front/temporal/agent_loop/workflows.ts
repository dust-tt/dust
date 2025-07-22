import type { ChildWorkflowHandle } from "@temporalio/workflow";
import {
  proxyActivities,
  startChild,
  WorkflowExecutionAlreadyStartedError,
  workflowInfo,
} from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as ensureTitleActivities from "@app/temporal/agent_loop/activities/ensure_conversation_title";
import type * as runModelActivities from "@app/temporal/agent_loop/activities/run_model";
import type * as runToolActivities from "@app/temporal/agent_loop/activities/run_tool";
import type { AgentLoopActivities } from "@app/temporal/agent_loop/lib/activity_interface";
import { executeAgentLoop } from "@app/temporal/agent_loop/lib/agent_loop_executor";
import { makeAgentLoopConversationTitleWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import type {
  RunAgentArgs,
  RunAgentAsynchronousArgs,
} from "@app/types/assistant/agent_run";

const activities: AgentLoopActivities = {
  runModelActivity: proxyActivities<typeof runModelActivities>({
    startToCloseTimeout: "10 minutes",
  }).runModelActivity,
  runToolActivity: proxyActivities<typeof runToolActivities>({
    startToCloseTimeout: "10 minutes",
  }).runToolActivity,
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
  };

  await ensureConversationTitleActivity(authType, runAgentArgs);
}

export async function agentLoopWorkflow({
  authType,
  runAsynchronousAgentArgs,
}: {
  authType: AuthenticatorType;
  runAsynchronousAgentArgs: RunAgentAsynchronousArgs;
}) {
  const { searchAttributes: parentSearchAttributes, memo } = workflowInfo();

  const runAgentArgs: RunAgentArgs = {
    sync: false,
    idArgs: runAsynchronousAgentArgs,
  };

  // Start a child workflow to compute the conversation title. Do not await it.
  // Swallow the error if one is already running.
  let childWorkflowHandle: ChildWorkflowHandle<
    typeof agentLoopConversationTitleWorkflow
  >;
  try {
    childWorkflowHandle = await startChild(agentLoopConversationTitleWorkflow, {
      workflowId: makeAgentLoopConversationTitleWorkflowId(
        authType,
        runAsynchronousAgentArgs
      ),
      searchAttributes: parentSearchAttributes,
      args: [{ authType, runAsynchronousAgentArgs }],
      memo,
    });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      return;
    }
    throw err;
  }

  await executeAgentLoop(authType, runAgentArgs, activities);

  await childWorkflowHandle.result();
}
