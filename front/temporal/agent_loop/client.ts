import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import assert from "assert";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { logAgentLoopStart } from "@app/temporal/agent_loop/activities/instrumentation";
import { makeAgentLoopWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

import { QUEUE_NAME } from "./config";
import { agentLoopWorkflow } from "./workflows";

export async function launchAgentLoopWorkflow({
  auth,
  agentLoopArgs,
  startStep,
}: {
  auth: Authenticator;
  agentLoopArgs: AgentLoopArgs;
  startStep: number;
  initialStartTime: number;
}): Promise<
  Result<undefined, Error | DustError<"agent_loop_already_running">>
> {
  const authType = auth.toJSON();

  // Capture initial start time and log total execution start.
  const initialStartTime = Date.now();
  const conversationId = agentLoopArgs.conversationId;
  const agentMessageId = agentLoopArgs.agentMessageId;

  logAgentLoopStart();
  // Clear action required in conversation - the loop will put them back if needed.
  await ConversationResource.clearActionRequired(auth, conversationId);

  const client = await getTemporalClientForAgentNamespace();

  assert(authType.workspaceId, "Workspace ID is required");
  const workflowId = makeAgentLoopWorkflowId({
    workspaceId: authType.workspaceId,
    conversationId,
    agentMessageId,
  });

  try {
    await client.workflow.start(agentLoopWorkflow, {
      args: [
        {
          authType,
          agentLoopArgs,
          startStep,
          initialStartTime,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        conversationId: [conversationId],
        workspaceId: authType.workspaceId ? [authType.workspaceId] : undefined,
      },
      memo: {
        conversationId,
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
