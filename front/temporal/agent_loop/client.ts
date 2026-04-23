import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { logAgentLoopStart } from "@app/temporal/agent_loop/activities/instrumentation";
import {
  makeAgentLoopWorkflowId,
  makeCompactionWorkflowId,
} from "@app/temporal/agent_loop/lib/workflow_ids";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { CompactionSourceConversation } from "@app/types/assistant/compaction";
import type { ModelIdentifier } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import { QUEUE_NAME } from "./config";
import { agentLoopWorkflow, compactionWorkflow } from "./workflows";

export async function launchAgentLoopWorkflow({
  auth,
  agentLoopArgs,
  startStep,
  waitForCompletion,
}: {
  auth: Authenticator;
  agentLoopArgs: AgentLoopArgs;
  startStep: number;
  waitForCompletion?: boolean;
}): Promise<
  Result<undefined, Error | DustError<"agent_loop_already_running">>
> {
  const authType = auth.toJSON();
  const { workspaceId } = authType;

  // Capture initial start time and log total execution start.
  const initialStartTime = Date.now();
  const conversationId = agentLoopArgs.conversationId;
  const agentMessageId = agentLoopArgs.agentMessageId;

  logAgentLoopStart();
  // Clear action required in conversation - the loop will put them back if needed.
  await ConversationResource.clearActionRequired(auth, conversationId);

  const client = await getTemporalClientForAgentNamespace();

  const workflowId = makeAgentLoopWorkflowId({
    workspaceId,
    conversationId,
    agentMessageId,
  });

  // Optionally wait for any in-flight workflow with the same id to complete
  // before attempting to (re)start. This mitigates a race where validation can
  // re-trigger the loop while the originating run is still finalizing.
  if (waitForCompletion) {
    try {
      const handle = client.workflow.getHandle(workflowId);
      await handle.result();
    } catch (error) {
      // If the workflow doesn't exist or failed, we ignore and proceed to start
      // a new one. We only care about avoiding the AlreadyStarted race.
      logger.info(
        { workflowId, error },
        "Non-fatal while waiting for prior agent loop completion"
      );
    }
  }

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
        workspaceId: [workspaceId],
      },
      memo: {
        conversationId,
        workspaceId,
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
        workspaceId,
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

export async function launchCompactionWorkflow({
  auth,
  conversationId,
  compactionMessageId,
  compactionMessageVersion,
  model,
  sourceConversation,
}: {
  auth: Authenticator;
  conversationId: string;
  compactionMessageId: string;
  compactionMessageVersion: number;
  model: ModelIdentifier;
  sourceConversation?: CompactionSourceConversation;
}): Promise<
  Result<undefined, Error | DustError<"compaction_already_running">>
> {
  const authType = auth.toJSON();
  const { workspaceId } = authType;
  const client = await getTemporalClientForAgentNamespace();

  const workflowId = makeCompactionWorkflowId({
    workspaceId,
    conversationId,
  });
  try {
    await client.workflow.start(compactionWorkflow, {
      args: [
        {
          authType,
          conversationId,
          compactionMessageId,
          compactionMessageVersion,
          model,
          sourceConversation,
        },
      ],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        conversationId: [conversationId],
        workspaceId: [workspaceId],
      },
      memo: {
        conversationId,
        workspaceId,
      },
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
      throw error;
    }

    logger.warn(
      { workflowId, workspaceId },
      "Compaction workflow already running for this conversation."
    );

    return new Err(
      new DustError(
        "compaction_already_running",
        "Compaction workflow already running for this conversation."
      )
    );
  }

  return new Ok(undefined);
}
