import type { Result } from "@dust-tt/types";
import { Err, normalizeError, Ok } from "@dust-tt/types";
import type { Client, ScheduleHandle } from "@temporalio/client";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
} from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/gong/temporal/config";
import { gongSyncWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

const logger = mainLogger.child({ provider: "gong" });

// This function generates a connector-wise unique schedule ID for the Gong sync.
// The IDs of the workflows spawned by this schedule will follow the pattern:
//   gong-sync-${connectorId}-workflow-${isoFormatDate}
function makeGongSyncScheduleId(connector: ConnectorResource): string {
  return `gong-sync-${connector.id}`;
}

// Terminates running workflows spawned by the given schedule.
// Throw a `ScheduleNotFoundError` if the schedule does not exist.
async function terminateWorkflowsForSchedule(
  scheduleHandle: ScheduleHandle,
  client: Client
) {
  const scheduleDescription = await scheduleHandle.describe();
  // Terminate all the recent actions of the schedule,
  // the running workflows are not available under scheduleDescription.info.runningActions.
  for (const action of scheduleDescription.info.recentActions) {
    try {
      const workflowHandle = client.workflow.getHandle(
        action.action.workflow.workflowId
      );
      await workflowHandle.terminate();
    } catch (error) {
      if (!(error instanceof WorkflowNotFoundError)) {
        logger.error({ error }, "[Gong] Failed to terminate workflow.");
        throw error;
      }
    }
  }
}

export async function createGongSyncSchedule(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeGongSyncScheduleId(connector);

  try {
    const scheduleHandle = await client.schedule.create({
      action: {
        type: "startWorkflow",
        workflowType: gongSyncWorkflow,
        args: [
          {
            connectorId: connector.id,
            fromTs: null,
            forceResync: false,
          },
        ],
        taskQueue: QUEUE_NAME,
      },
      scheduleId,
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

    // Trigger the schedule to start the workflow immediately.
    await scheduleHandle.trigger();
  } catch (error) {
    logger.error(
      {
        connectorId: connector.id,
        scheduleId,
        error,
      },
      "[Gong] Failed to create schedule and launch Gong sync."
    );
    return new Err(normalizeError(error));
  }

  return new Ok(scheduleId);
}

export async function deleteGongSyncSchedule(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeGongSyncScheduleId(connector);

  const scheduleHandle = client.schedule.getHandle(scheduleId);
  try {
    // Terminate the running workflows.
    await terminateWorkflowsForSchedule(scheduleHandle, client);

    // Delete the schedule.
    await scheduleHandle.delete();
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) {
      logger.error(
        {
          connectorId: connector.id,
          scheduleId,
          error,
        },
        "[Gong] Failed to delete schedule and terminate workflow."
      );
      return new Err(normalizeError(error));
    }
  }

  return new Ok(undefined);
}

// Starts the sync of Gong data for the given connector.
// - Unpauses the schedule if paused.
// - Triggers the schedule to start the sync workflow immediately.
export async function startGongSync(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeGongSyncScheduleId(connector);

  const scheduleHandle = client.schedule.getHandle(scheduleId);
  try {
    // Unpause the schedule if paused.
    const scheduleDescription = await scheduleHandle.describe();
    if (scheduleDescription.state.paused) {
      await scheduleHandle.unpause();
    }

    // Trigger the schedule to start the workflow immediately.
    await scheduleHandle.trigger();
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) {
      logger.error(
        {
          connectorId: connector.id,
          scheduleId,
          error,
        },
        "[Gong] Failed to unpause and trigger schedule."
      );
      return new Err(normalizeError(error));
    }
  }

  return new Ok(scheduleId);
}

// Stops the sync of Gong data for the given connector.
// - Pauses the schedule.
// - Terminates any running workflows for the schedule.
export async function stopGongSync(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeGongSyncScheduleId(connector);

  const scheduleHandle = client.schedule.getHandle(scheduleId);
  try {
    // Pause the schedule if running.
    await scheduleHandle.pause();

    // Terminate the running workflows.
    await terminateWorkflowsForSchedule(scheduleHandle, client);
  } catch (error) {
    if (!(error instanceof ScheduleNotFoundError)) {
      logger.error(
        {
          connectorId: connector.id,
          scheduleId,
          error,
        },
        "[Gong] Failed to stop schedule and terminate workflow."
      );
      return new Err(normalizeError(error));
    }
  }

  return new Ok(undefined);
}
