import type { ModelId } from "@dust-tt/types";
import {
  executeChild,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/intercom/temporal/activities";
import type { IntercomUpdateSignal } from "@connectors/connectors/intercom/temporal/signals";

import { intercomUpdatesSignal } from "./signals";

const {
  getHelpCenterIdsToSyncActivity,
  syncHelpCenterOnlyActivity,
  getCollectionsIdsToSyncActivity,
  syncCollectionActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

const { saveIntercomConnectorStartSync, saveIntercomConnectorSuccessSync } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

/**
 * Sync Workflow for Intercom.
 * This workflow is responsible for syncing all the help centers for a given connector.
 * Lauched on a cron schedule every hour, it will sync all the help centers that are in DB.
 * If a signal is received, it will sync the help centers that were modified.
 */
export async function intercomSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await saveIntercomConnectorStartSync({ connectorId });

  const helpCenterIds = await getHelpCenterIdsToSyncActivity(connectorId);
  const uniqueHelpCenterIds = new Set(helpCenterIds);

  // If we get a signal, update the workflow state by adding help center ids.
  // We send a signal when permissions are updated by the admin.
  setHandler(
    intercomUpdatesSignal,
    (intercomUpdates: IntercomUpdateSignal[]) => {
      for (const { type, intercomId } of intercomUpdates) {
        if (type === "help_center") {
          uniqueHelpCenterIds.add(intercomId);
        }
      }
    }
  );

  const {
    workflowId,
    searchAttributes: parentSearchAttributes,
    memo,
  } = workflowInfo();

  const currentSyncMs = new Date().getTime();

  // Async operations allow Temporal's event loop to process signals.
  // If a signal arrives during an async operation, it will update the set before the next iteration.
  while (uniqueHelpCenterIds.size > 0) {
    // Create a copy of the set to iterate over, to avoid issues with concurrent modification.
    const helpCenterIdsToProcess = new Set(uniqueHelpCenterIds);
    for (const helpCenterId of helpCenterIdsToProcess) {
      if (!uniqueHelpCenterIds.has(helpCenterId)) {
        continue;
      }
      // Async operation yielding control to the Temporal runtime.
      await executeChild(intercomHelpCenterSyncWorklow, {
        workflowId: `${workflowId}-help-center-${helpCenterId}`,
        searchAttributes: parentSearchAttributes,
        args: [
          {
            connectorId,
            helpCenterId,
            currentSyncMs,
          },
        ],
        memo,
      });
      // Remove the processed help center from the original set after the async operation.
      uniqueHelpCenterIds.delete(helpCenterId);
    }
  }

  await saveIntercomConnectorSuccessSync({ connectorId });
}

/**
 * Sync Workflow for a Help Center.
 * Launched by the IntercomSyncWorkflow, it will sync a given help center.
 * We sync a HelpCenter by fetching all the Collections and Articles.
 */
export async function intercomHelpCenterSyncWorklow({
  connectorId,
  helpCenterId,
  currentSyncMs,
}: {
  connectorId: ModelId;
  helpCenterId: string;
  currentSyncMs: number;
}) {
  await syncHelpCenterOnlyActivity({
    connectorId,
    helpCenterId,
    currentSyncMs,
  });

  const collectionIds = await getCollectionsIdsToSyncActivity({
    connectorId,
    helpCenterId,
  });

  for (const collectionId of collectionIds) {
    await syncCollectionActivity({
      connectorId,
      helpCenterId,
      collectionId,
      currentSyncMs,
    });
  }
}
