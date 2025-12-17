import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/usage_queue/config";
import {
  trackProgrammaticUsageWorkflow,
  updateWorkspaceUsageWorkflow,
} from "@app/temporal/usage_queue/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

import { makeTrackProgrammaticUsageWorkflowId } from "./helpers";

async function shouldProcessUsageUpdate(workflowId: string) {
  // Compute the max usage of the workspace once per hour.
  const remainingRunsThisHour = await rateLimiter({
    key: workflowId,
    maxPerTimeframe: 1,
    timeframeSeconds: 60 * 60, // 1 hour.
    logger: logger,
  });

  return remainingRunsThisHour > 0;
}

/**
 * This function starts a workflow to compute the maximum usage of a workspace once per hour per workspace.
 */
export async function launchUpdateUsageWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const workflowId = `workflow-usage-queue-${workspaceId}`;

  const shouldProcess = await shouldProcessUsageUpdate(workflowId);
  if (!shouldProcess) {
    return new Ok(undefined);
  }

  const client = await getTemporalClientForFrontNamespace();

  try {
    await client.workflow.start(updateWorkspaceUsageWorkflow, {
      args: [workspaceId],
      taskQueue: QUEUE_NAME,
      workflowId: workflowId,
      memo: {
        workspaceId,
      },
    });

    logger.info(
      {
        workflowId,
      },
      "Started usage workflow."
    );

    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          error: e,
        },
        "Failed starting usage workflow."
      );
    }
    return new Err(normalizeError(e));
  }
}

export async function launchTrackProgrammaticUsageWorkflow({
  authType,
  agentLoopArgs,
}: {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgs;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;

  const { agentMessageId, conversationId } = agentLoopArgs;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeTrackProgrammaticUsageWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
  });

  try {
    await client.workflow.start(trackProgrammaticUsageWorkflow, {
      args: [authType, { agentLoopArgs }],
      taskQueue: QUEUE_NAME,
      workflowId,
      memo: {
        agentMessageId,
        workspaceId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    if (!(e instanceof WorkflowExecutionAlreadyStartedError)) {
      logger.error(
        {
          workflowId,
          agentMessageId,
          error: e,
        },
        "Failed starting agent analytics workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}
