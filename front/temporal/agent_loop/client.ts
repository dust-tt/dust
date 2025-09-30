import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { AuthenticatorType } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { makeAgentLoopWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import assert from "assert";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type { RunAgentAsynchronousArgs } from "@app/types/assistant/agent_run";

import { QUEUE_NAME } from "./config";
import { agentLoopWorkflow } from "./workflows";

export async function launchAgentLoopWorkflow({
  authType,
  runAsynchronousAgentArgs,
  startStep,
  initialStartTime,
}: {
  authType: AuthenticatorType;
  runAsynchronousAgentArgs: RunAgentAsynchronousArgs;
  startStep: number;
  initialStartTime: number;
}): Promise<
  Result<undefined, Error | DustError<"agent_loop_already_running">>
> {
  const client = await getTemporalClientForAgentNamespace();

  assert(authType.workspaceId, "Workspace ID is required");
  const workflowId = makeAgentLoopWorkflowId({
    workspaceId: authType.workspaceId,
    conversationId: runAsynchronousAgentArgs.conversationId,
    agentMessageId: runAsynchronousAgentArgs.agentMessageId,
  });

  try {
    await client.workflow.start(agentLoopWorkflow, {
      args: [
        { authType, runAsynchronousAgentArgs, startStep, initialStartTime },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        conversationId: [runAsynchronousAgentArgs.conversationId],
        workspaceId: authType.workspaceId ? [authType.workspaceId] : undefined,
      },
      memo: {
        conversationId: runAsynchronousAgentArgs.conversationId,
        workspaceId: authType.workspaceId,
      },
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
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

    return new Err(
      new DustError(
        "agent_loop_already_running",
        "Agent loop already running for this message."
      )
    );
  }

  return new Ok(undefined);
}
