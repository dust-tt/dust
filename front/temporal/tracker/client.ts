import type { WorkflowHandle } from "@temporalio/client";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import {
  RUN_QUEUE_NAME,
  TRACKER_NOTIFICATION_QUEUE_NAME,
} from "@app/temporal/tracker/config";
import type { ConnectorProvider, TrackerIdWorkspaceId } from "@app/types";

import { newUpsertSignal, notifySignal } from "./signals";
import {
  trackersGenerationWorkflow,
  trackersNotificationsWorkflow,
} from "./workflows";

export async function launchTrackersGenerationWorkflow({
  workspaceId,
  dataSourceId,
  documentId,
  documentHash,
  dataSourceConnectorProvider,
}: {
  workspaceId: string;
  dataSourceId: string;
  documentId: string;
  documentHash: string;
  dataSourceConnectorProvider: ConnectorProvider | null;
}) {
  const client = await getTemporalClientForFrontNamespace();

  await client.workflow.signalWithStart(trackersGenerationWorkflow, {
    args: [
      workspaceId,
      dataSourceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider,
    ],
    taskQueue: RUN_QUEUE_NAME,
    workflowId: `tracker-generate-workflow-${workspaceId}-${dataSourceId}-${documentId}`,
    signal: newUpsertSignal,
    signalArgs: undefined,
  });
}

async function launchTrackerNotificationWorkflow(
  signaledTrackerIds: TrackerIdWorkspaceId[] = []
) {
  const client = await getTemporalClientForFrontNamespace();
  await client.workflow.signalWithStart(trackersNotificationsWorkflow, {
    args: [],
    taskQueue: TRACKER_NOTIFICATION_QUEUE_NAME,
    workflowId: "tracker-notify-workflow",
    signal: notifySignal,
    signalArgs: [signaledTrackerIds],
    cronSchedule: "0 * * * *", // Every hour.
  });
}

async function stopTrackerNotificationWorkflow() {
  const client = await getTemporalClientForFrontNamespace();

  try {
    const handle: WorkflowHandle<typeof trackersNotificationsWorkflow> =
      client.workflow.getHandle("tracker-notify-workflow");
    await handle.terminate();
  } catch (e) {
    logger.error(
      {
        error: e,
      },
      "[Tracker] Failed stopping workflow."
    );
  }
}
