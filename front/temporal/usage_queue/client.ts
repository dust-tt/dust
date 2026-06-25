import type { AuthenticatorType } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/usage_queue/config";
import {
  makeMetronomeSeatCountSyncWorkflowId,
  makeMetronomeUsageEventsWorkflowId,
  makeTrackProgrammaticUsageWorkflowId,
} from "@app/temporal/usage_queue/helpers";
import { syncMetronomeSeatCountSignal } from "@app/temporal/usage_queue/signals";
import {
  emitMetronomeUsageEventsWorkflow,
  syncMetronomeSeatCountWorkflow,
  trackProgrammaticUsageWorkflow,
  updateWorkspaceUsageWorkflow,
} from "@app/temporal/usage_queue/workflows";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";

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
      searchAttributes: {
        conversationId: [conversationId],
        workspaceId: [workspaceId],
      },
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

export async function launchEmitMetronomeUsageEventsWorkflow({
  authType,
  agentLoopArgs,
}: {
  authType: AuthenticatorType;
  agentLoopArgs: AgentLoopArgs;
}): Promise<Result<undefined, Error>> {
  const { workspaceId } = authType;
  const { agentMessageId, conversationId } = agentLoopArgs;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeMetronomeUsageEventsWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
  });

  try {
    await client.workflow.start(emitMetronomeUsageEventsWorkflow, {
      args: [authType, { agentLoopArgs }],
      taskQueue: QUEUE_NAME,
      workflowId,
      searchAttributes: {
        conversationId: [conversationId],
        workspaceId: [workspaceId],
      },
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
        "[Metronome] Failed starting usage events workflow"
      );
    }

    return new Err(normalizeError(e));
  }
}

export async function launchMetronomeSeatCountSyncWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeMetronomeSeatCountSyncWorkflowId({ workspaceId });

  try {
    await client.workflow.signalWithStart(syncMetronomeSeatCountWorkflow, {
      args: [workspaceId],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: syncMetronomeSeatCountSignal,
      signalArgs: undefined,
      memo: {
        workspaceId,
      },
    });
    return new Ok(undefined);
  } catch (e) {
    logger.error(
      {
        workflowId,
        workspaceId,
        error: e,
      },
      "[Metronome] Failed to signal seat count sync workflow"
    );
    return new Err(normalizeError(e));
  }
}
