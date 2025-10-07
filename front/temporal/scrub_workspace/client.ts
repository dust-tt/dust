import type { WorkflowHandle } from "@temporalio/client";
import { WorkflowNotFoundError } from "@temporalio/client";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { runScrubFreeEndedWorkspacesSignal } from "@app/temporal/scrub_workspace/signals";
import {
  downgradeFreeEndedWorkspacesWorkflow,
  immediateWorkspaceScrubWorkflow,
  scheduleWorkspaceScrubWorkflowV2,
} from "@app/temporal/scrub_workspace/workflows";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import {
  DOWNGRADE_FREE_ENDED_WORKSPACES_WORKFLOW_ID,
  QUEUE_NAME,
} from "./config";

export async function launchScheduleWorkspaceScrubWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = getWorkflowId(workspaceId);

  try {
    await client.workflow.start(scheduleWorkspaceScrubWorkflowV2, {
      args: [{ workspaceId }],
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
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(normalizeError(e));
  }
}

export async function launchImmediateWorkspaceScrubWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<string, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = getWorkflowId(workspaceId);

  try {
    await client.workflow.start(immediateWorkspaceScrubWorkflow, {
      args: [{ workspaceId }],
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
      `Started workflow.`
    );
    return new Ok(workflowId);
  } catch (e) {
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed starting workflow.`
    );
    return new Err(normalizeError(e));
  }
}

export async function terminateScheduleWorkspaceScrubWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<void, Error>> {
  const client = await getTemporalClientForFrontNamespace();
  const workflowId = getWorkflowId(workspaceId);
  try {
    const handle: WorkflowHandle<typeof scheduleWorkspaceScrubWorkflowV2> =
      client.workflow.getHandle(workflowId);
    await handle.terminate();
    logger.info(
      {
        workflowId,
      },
      `Terminated workflow.`
    );
    return new Ok(undefined);
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return new Ok(undefined);
    }
    logger.error(
      {
        workflowId,
        error: e,
      },
      `Failed terminating workflow.`
    );
    return new Err(normalizeError(e));
  }
}

function getWorkflowId(workspaceId: string) {
  return `schedule-workspace-scrub-${workspaceId}`;
}

export async function launchDowngradeFreeEndedWorkspacesWorkflow(): Promise<
  Result<undefined, Error>
> {
  const client = await getTemporalClientForFrontNamespace();
  await client.workflow.signalWithStart(downgradeFreeEndedWorkspacesWorkflow, {
    args: [],
    taskQueue: QUEUE_NAME,
    workflowId: DOWNGRADE_FREE_ENDED_WORKSPACES_WORKFLOW_ID,
    signal: runScrubFreeEndedWorkspacesSignal,
    signalArgs: undefined,
    cronSchedule: "0 18 * * 1-5", // Every weekday at 6pm.
  });

  return new Ok(undefined);
}

export async function stopDowngradeFreeEndedWorkspacesWorkflow() {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle: WorkflowHandle<typeof downgradeFreeEndedWorkspacesWorkflow> =
      client.workflow.getHandle(DOWNGRADE_FREE_ENDED_WORKSPACES_WORKFLOW_ID);
    await handle.terminate();
  } catch (e) {
    logger.error(
      {
        error: e,
      },
      "[Downgrade and Scrub Free Ended Workspaces] Failed stopping workflow."
    );
  }
}
