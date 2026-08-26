import { getRetryPolicyFromToolConfiguration } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { logAgentLoopStart } from "@app/temporal/agent_loop/activities/instrumentation";
import {
  makeAgentLoopWorkflowId,
  makeCompactionWorkflowId,
  makeSandboxChildToolWorkflowId,
} from "@app/temporal/agent_loop/lib/workflow_ids";
import type {
  AgentLoopArgs,
  AgentLoopArgsWithTiming,
} from "@app/types/assistant/agent_run";
import type { CompactionSourceConversation } from "@app/types/assistant/compaction";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { SupportedModel } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { v4 as uuidv4 } from "uuid";
import { getQueueForUserMessageOrigin, getQueueName } from "./config";
import {
  agentLoopWorkflow,
  compactionWorkflow,
  runSandboxChildToolWorkflow,
} from "./workflows";

// Relaunch paths (tool validation, retries, authentication resolution) pass the origin of the
// original user message and the same conversation, so a run keeps its queue across relaunches.
export async function getTaskQueueForRun(
  auth: Authenticator,
  {
    userMessageOrigin,
    conversationId,
  }: {
    userMessageOrigin: UserMessageOrigin;
    conversationId: string;
  }
): Promise<string> {
  // Schedule triggers and fair-use webhook triggers share the `triggered` origin (the origin
  // encodes billing, not the trigger kind): resolve the conversation's trigger to keep webhook
  // firings off the schedules queue. Deleting a trigger nulls the conversation's pointer, in
  // which case the run stays on schedules.
  if (userMessageOrigin === "triggered") {
    const trigger = await TriggerResource.fetchByConversationId(
      auth,
      conversationId
    );
    if (trigger && trigger.kind === "webhook") {
      return getQueueName("batch");
    }
  }

  return getQueueName(getQueueForUserMessageOrigin(userMessageOrigin));
}

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

  const executionArgs: AgentLoopArgs = {
    ...agentLoopArgs,
    runKey: uuidv4(),
    rootAgentMessageId:
      agentLoopArgs.rootAgentMessageId ??
      (await ConversationResource.findRootAgentMessageId(auth, {
        agentMessageId,
      })),
  };

  try {
    await client.workflow.start(agentLoopWorkflow, {
      args: [
        {
          authType,
          agentLoopArgs: executionArgs,
          startStep,
          initialStartTime,
        },
      ],
      taskQueue: await getTaskQueueForRun(auth, {
        userMessageOrigin: executionArgs.userMessageOrigin,
        conversationId,
      }),
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
  model: SupportedModel;
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
      // No user message origin to route on: a human is waiting on the compacted
      // conversation, so interactive.
      taskQueue: getQueueName("interactive"),
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

export async function launchSandboxChildToolWorkflow(
  auth: Authenticator,
  {
    agentLoopArgs,
    action,
    step,
    waitForCompletion,
  }: {
    agentLoopArgs: AgentLoopArgsWithTiming;
    action: AgentMCPActionResource;
    step: number;
    // On resume paths, wait for any prior run for this action to finalize first
    // — same mechanism as launchAgentLoopWorkflow.
    waitForCompletion?: boolean;
  }
): Promise<Result<undefined, Error>> {
  const authType = auth.toJSON();
  const { workspaceId } = authType;
  const client = await getTemporalClientForAgentNamespace();

  const workflowId = makeSandboxChildToolWorkflowId({
    workspaceId,
    actionModelId: action.id,
  });

  await ConversationResource.clearActionRequired(
    auth,
    agentLoopArgs.conversationId
  );

  if (waitForCompletion) {
    try {
      const handle = client.workflow.getHandle(workflowId);
      await handle.result();
    } catch (error) {
      logger.info(
        { workflowId, error },
        "Non-fatal while waiting for prior sandbox child workflow completion"
      );
    }
  }

  try {
    await client.workflow.start(runSandboxChildToolWorkflow, {
      args: [
        {
          authType,
          agentLoopArgs,
          actionModelId: action.id,
          retryPolicy: getRetryPolicyFromToolConfiguration(
            action.toolConfiguration
          ),
          step,
        },
      ],
      taskQueue: await getTaskQueueForRun(auth, {
        userMessageOrigin: agentLoopArgs.userMessageOrigin,
        conversationId: agentLoopArgs.conversationId,
      }),
      workflowId,
      searchAttributes: {
        conversationId: [agentLoopArgs.conversationId],
        workspaceId: [workspaceId],
      },
      memo: {
        conversationId: agentLoopArgs.conversationId,
        workspaceId,
      },
    });
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) {
      // Idempotent: another caller already kicked it off for this action.
      return new Ok(undefined);
    }
    throw error;
  }

  return new Ok(undefined);
}
