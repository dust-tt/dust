import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { makeAgentLoopWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import type { Result } from "@app/types";
import { Ok } from "@app/types";
import type { RunAgentAsynchronousArgs } from "@app/types/assistant/agent_run";

import { QUEUE_NAME } from "./config";
import { agentLoopWorkflow } from "./workflows";

export async function launchAgentLoopWorkflow({
  authType,
  runAsynchronousAgentArgs,
  startStep,
  initialStartTime,
  ignoreExistingWorkflow,
}: {
  authType: AuthenticatorType;
  runAsynchronousAgentArgs: RunAgentAsynchronousArgs;
  startStep: number;
  initialStartTime: number;
  ignoreExistingWorkflow?: boolean;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForAgentNamespace();

  const workflowId = makeAgentLoopWorkflowId(
    authType,
    runAsynchronousAgentArgs
  );

  try {
    await client.workflow.start(agentLoopWorkflow, {
      args: [
        { authType, runAsynchronousAgentArgs, startStep, initialStartTime },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
    });
  } catch (error) {
    if (
      !(error instanceof WorkflowExecutionAlreadyStartedError) ||
      !ignoreExistingWorkflow
    ) {
      throw error;
    }
    logger.warn(
      {
        workflowId,
        error,
        workspaceId: authType.workspaceId,
      },
      "Attempting to launch an agent loop workflow when there's already one running."
    );
  }

  return new Ok(undefined);
}
