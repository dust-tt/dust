import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { ScheduleOptionsAction } from "@temporalio/client";
import {
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/gong/temporal/config";
import { gongSyncWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

// This function generates a connector-wise unique schedule ID for the Gong sync.
// The IDs of the workflows spawned by this schedule will follow the pattern:
//   gong-sync-${connectorId}-workflow-${isoFormatDate}
function makeGongSyncScheduleId(connector: ConnectorResource): string {
  return `gong-sync-${connector.id}`;
}

// Starts the sync of Gong data for the given connector.
// - Creates a new schedule if it doesn't exist.
// - Resumes the schedule if paused.
// - Triggers the schedule to start the sync workflow immediately.
export async function launchGongSync(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const scheduleId = makeGongSyncScheduleId(connector);

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
    const scheduleHandle = client.schedule.getHandle(
      makeGongSyncScheduleId(connector)
    );
    const scheduleDescription = await scheduleHandle.describe();
    if (scheduleDescription.state.paused) {
      logger.info(
        {
          connectorId: connector.id,
          provider: "gong",
          scheduleId,
        },
        "[Gong] Resuming paused sync schedule."
      );
      await scheduleHandle.unpause();
    }
    // Trigger the schedule to start the workflow immediately.
    await scheduleHandle.trigger();
  } catch (err) {
    if (err instanceof ScheduleNotFoundError) {
      // Create the schedule if it doesn't exist.
      await client.schedule.create({
        action,
        scheduleId: makeGongSyncScheduleId(connector),
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
    }
    return new Err(err as Error);
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

  try {
    // Pause the schedule if running.
    const scheduleHandle = client.schedule.getHandle(
      makeGongSyncScheduleId(connector)
    );
    try {
      await scheduleHandle.pause();
      const scheduleDescription = await scheduleHandle.describe();

      // Terminate the running workflows.
      for (const action of scheduleDescription.info.runningActions) {
        const workflowHandle = client.workflow.getHandle(
          action.workflow.workflowId
        );
        await workflowHandle.terminate();
      }
    } catch (e) {
      if (!(e instanceof ScheduleNotFoundError)) {
        return new Err(e as Error);
      }
    }

    return new Ok(undefined);
  } catch (error) {
    logger.error(
      {
        connectorId: connector.id,
        provider: "gong",
        scheduleId,
        error,
      },
      "[Gong] Failed to stop schedule and workflow."
    );
    return new Err(error as Error);
  }
}
