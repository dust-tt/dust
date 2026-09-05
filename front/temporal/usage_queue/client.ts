import type { AuthenticatorType } from "@app/lib/auth";
import { computeRunKey } from "@app/lib/metronome/events";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { QUEUE_NAME } from "@app/temporal/usage_queue/config";
import {
  makeMetronomeSeatCountSyncWorkflowId,
  makeMetronomeUsageEventsWorkflowId,
  makeReconcileApiKeyCreditStateWorkflowId,
  makeTrackProgrammaticUsageWorkflowId,
} from "@app/temporal/usage_queue/helpers";
import {
  reconcileApiKeyCreditStateSignal,
  syncMetronomeSeatCountSignal,
} from "@app/temporal/usage_queue/signals";
import {
  emitMetronomeUsageEventsWorkflow,
  reconcileApiKeyCreditStateWorkflow,
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

  const { agentMessageId, conversationId, dustRunIds } = agentLoopArgs;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeTrackProgrammaticUsageWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
    runKey: dustRunIds?.length ? computeRunKey(dustRunIds) : "legacy",
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
  const { agentMessageId, conversationId, dustRunIds } = agentLoopArgs;

  const client = await getTemporalClientForFrontNamespace();

  const workflowId = makeMetronomeUsageEventsWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
    runKey: dustRunIds?.length ? computeRunKey(dustRunIds) : "legacy",
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
  immediate = false,
}: {
  workspaceId: string;
  // Skip the debounce window and sync now. Used when a caller needs the seat
  // reflected immediately (e.g. right after provisioning a new contract) rather
  // than after the coalescing delay.
  immediate?: boolean;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeMetronomeSeatCountSyncWorkflowId({ workspaceId });

  try {
    // `args` seeds a fresh workflow; `signalArgs` carries `immediate` to an
    // already-running (debouncing) instance so it wakes early.
    await client.workflow.signalWithStart(syncMetronomeSeatCountWorkflow, {
      args: [workspaceId, { immediate }],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: syncMetronomeSeatCountSignal,
      signalArgs: [{ immediate }],
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

// Debounced per-API-key credit-state reconcile. signalWithStart on a stable
// per-(workspace, key) workflow id coalesces repeated triggers within the
// debounce window into a single reconcile run.
export async function launchReconcileApiKeyCreditStateWorkflow({
  workspaceId,
  keyId,
}: {
  workspaceId: string;
  keyId: number;
}): Promise<Result<undefined, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = makeReconcileApiKeyCreditStateWorkflowId({
    workspaceId,
    keyId,
  });

  try {
    await client.workflow.signalWithStart(reconcileApiKeyCreditStateWorkflow, {
      args: [workspaceId, keyId],
      taskQueue: QUEUE_NAME,
      workflowId,
      signal: reconcileApiKeyCreditStateSignal,
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
        keyId,
        error: e,
      },
      "[Metronome ApiKeyCap] Failed to signal reconcile workflow"
    );
    return new Err(normalizeError(e));
  }
}
