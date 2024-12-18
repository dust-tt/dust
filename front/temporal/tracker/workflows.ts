import type { ConnectorProvider, TrackerIdWorkspaceId } from "@dust-tt/types";
import {
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "./activities";
import { newUpsertSignal, notifySignal } from "./signals";

const { trackersGenerationActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
});

const { getTrackerIdsToNotifyActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const { processTrackerNotificationWorkflowActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "30 minutes",
});

/**
 * Workflow that is ran when a document is upserted.
 * It fetches the trackers that are watching the document and runs the document tracker generation.
 */
export async function trackersGenerationWorkflow(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null
) {
  let signaled = true;

  const debounceMs = (() => {
    if (!dataSourceConnectorProvider) {
      return 10000;
    }
    if (dataSourceConnectorProvider === "notion") {
      return 600000;
    }
    return 3600000;
  })();

  setHandler(newUpsertSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(debounceMs);

    if (signaled) {
      continue;
    }

    await trackersGenerationActivity(
      workspaceId,
      dataSourceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider
    );
  }
}

/**
 * Workflow that periodically checks for trackers to notify.
 * The workflow is scheduled to run every hour.
 * It fetches the tracker ids to notify and launches a child workflow for each tracker.
 */
export async function trackersNotificationsWorkflow() {
  const { workflowId, memo } = workflowInfo();
  const currentRunMs = new Date().getTime();
  const uniqueTrackers = new Set<TrackerIdWorkspaceId>();

  // Signal handler. Receives the tracker ids to notify.
  setHandler(notifySignal, (trackers: TrackerIdWorkspaceId[]) => {
    trackers.forEach((tracker) => {
      uniqueTrackers.add(tracker);
    });
  });

  // If we got no signal then we're on the scheduled execution: we process all trackers.
  if (uniqueTrackers.size === 0) {
    const trackers = await getTrackerIdsToNotifyActivity(currentRunMs);
    trackers.forEach((tracker) => uniqueTrackers.add(tracker));
  }

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (uniqueTrackers.size > 0) {
    // Create a copy of the set to iterate over, to avoid issues with concurrent modification.
    const trackersToProcess = new Set(uniqueTrackers);

    for (const tracker of trackersToProcess) {
      if (!uniqueTrackers.has(tracker)) {
        continue;
      }

      const { trackerId, workspaceId } = tracker;

      // Async operation yielding control to the Temporal runtime.
      await executeChild(processTrackerNotificationWorkflow, {
        workflowId: `${workflowId}-workspace-${workspaceId}-tracker-${trackerId}`,
        args: [
          {
            workspaceId,
            trackerId,
            currentRunMs,
          },
        ],
        memo,
      });

      // Remove the processed tracker from the original set after the async operation.
      uniqueTrackers.delete(tracker);
    }
  }
}

/**
 * Workflow that processes the notification tracker.
 * The workflow is launched as a child workflow from the notification workflow.
 */
export async function processTrackerNotificationWorkflow({
  trackerId,
  workspaceId,
  currentRunMs,
}: {
  trackerId: number;
  workspaceId: string;
  currentRunMs: number;
}) {
  await processTrackerNotificationWorkflowActivity({
    trackerId,
    workspaceId,
    currentRunMs,
  });
}
