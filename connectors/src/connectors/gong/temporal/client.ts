import type { Result } from "@dust-tt/types";
import { ScheduleOverlapPolicy } from "@temporalio/client";

import { QUEUE_NAME } from "@connectors/connectors/gong/temporal/config";
import { gongSyncWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import {
  createSchedule,
  deleteSchedule,
  pauseSchedule,
  triggerSchedule,
} from "@connectors/lib/temporal_schedules";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

// This function generates a connector-wise unique schedule ID for the Gong sync.
// The IDs of the workflows spawned by this schedule will follow the pattern:
//   gong-sync-${connectorId}-workflow-${isoFormatDate}
function makeGongSyncScheduleId(connector: ConnectorResource): string {
  return `gong-sync-${connector.id}`;
}

export async function createGongSyncSchedule(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  return createSchedule({
    connector,
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

export async function deleteGongSyncSchedule(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const scheduleId = makeGongSyncScheduleId(connector);
  return deleteSchedule({ connector, scheduleId });
}

export async function startGongSync(
  connector: ConnectorResource
): Promise<Result<string, Error>> {
  const scheduleId = makeGongSyncScheduleId(connector);
  return triggerSchedule({ connector, scheduleId });
}

export async function stopGongSync(
  connector: ConnectorResource
): Promise<Result<void, Error>> {
  const scheduleId = makeGongSyncScheduleId(connector);
  return pauseSchedule({ connector, scheduleId });
}
