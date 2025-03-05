import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { ScheduleOptionsAction, WorkflowHandle } from "@temporalio/client";
import {
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/gong/temporal/config";
import { gongSyncWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

function makeGongSyncWorkflowId(connector: ConnectorResource): string {
  return `gong-sync-${connector.id}`;
}

export async function launchGongSyncWorkflow(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const workflowId = makeGongSyncWorkflowId(connector);

  const action: ScheduleOptionsAction = {
    type: "startWorkflow",
    workflowType: gongSyncWorkflow,
    args: [
      {
        connectorId: connector.id,
      },
    ],
    taskQueue: QUEUE_NAME,
  };

  try {
    await client.schedule.create({
      action,
      scheduleId: makeGongSyncWorkflowId(connector),
      policies: {
        // If Temporal Server is down or unavailable at the time when a Schedule should take an Action.
        // Backfill scheduled action up to the previous day.
        catchupWindow: "1 day",
        // We buffer up to one workflow to make sure triggering a sync ensures having up-to-date data even if a very
        // long-running workflow was running.
        overlap: ScheduleOverlapPolicy.BUFFER_ONE,
      },
      spec: {
        // Adding a random offset to avoid all workflows starting at the same time and to take into account the fact
        // that many new transcripts will be made available roughly on the top of the hour.
        jitter: 30 * 60 * 1000, // 30 minutes
        intervals: [{ every: "1h" }],
      },
    });
  } catch (err) {
    return new Err(err as Error);
  }

  return new Ok(workflowId);
}

export async function stopGongSyncWorkflow(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const workflowId = makeGongSyncWorkflowId(connector);

  try {
    const handle: WorkflowHandle<typeof gongSyncWorkflow> =
      client.workflow.getHandle(workflowId);
    try {
      await handle.terminate();
    } catch (e) {
      if (!(e instanceof WorkflowNotFoundError)) {
        return new Err(e as Error);
      }
    }
    return new Ok(undefined);
  } catch (error) {
    logger.error({ workflowId, error }, "Failed to stop Gong workflow.");
    return new Err(error as Error);
  }
}
