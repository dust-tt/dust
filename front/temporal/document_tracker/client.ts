import type { ConnectorProvider, TrackerIdWorkspaceId } from "@dust-tt/types";
import type { WorkflowHandle } from "@temporalio/client";

import { getTemporalClient } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import {
  RUN_QUEUE_NAME,
  TRACKER_NOTIFICATION_QUEUE_NAME,
} from "@app/temporal/document_tracker/config";

import { newUpsertSignal, notifySignal } from "./signals";
import {
  runDocumentTrackerWorkflow,
  trackersNotificationsWorkflow,
} from "./workflows";

export async function launchRunDocumentTrackerWorkflow({
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
  const client = await getTemporalClient();

  await client.workflow.signalWithStart(runDocumentTrackerWorkflow, {
    args: [
      workspaceId,
      dataSourceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider,
    ],
    taskQueue: RUN_QUEUE_NAME,
    workflowId: `workflow-run-document-tracker-${workspaceId}-${dataSourceId}-${documentId}`,
    signal: newUpsertSignal,
    signalArgs: undefined,
  });
}

export async function launchTrackerNotificationWorkflow(
  signaledTrackerIds: TrackerIdWorkspaceId[] = []
) {
  const client = await getTemporalClient();
  await client.workflow.signalWithStart(trackersNotificationsWorkflow, {
    args: [],
    taskQueue: TRACKER_NOTIFICATION_QUEUE_NAME,
    workflowId: "document-tracker-notify-workflow",
    signal: notifySignal,
    signalArgs: [signaledTrackerIds],
    cronSchedule: "0 * * * *", // Every hour.
  });
}

export async function stopTrackerNotificationWorkflow() {
  const client = await getTemporalClient();

  try {
    const handle: WorkflowHandle<typeof trackersNotificationsWorkflow> =
      client.workflow.getHandle("document-tracker-notify-workflow");
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
