import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import { uniq } from "lodash";

import type { FolderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import { folderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import type * as activities from "@connectors/connectors/microsoft/temporal/activities";
import { typeAndPathFromInternalId } from "@connectors/connectors/microsoft/lib/utils";
import type * as sync_status from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";

const {
  getRootNodesToSync,
  syncFiles,
  syncOneMessage,
  markNodeAsSeen,
  populateDeltas,
  groupRootItemsByDriveId,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

const { microsoftDeletionActivity, microsoftGarbageCollectionActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "120 minutes",
  });

const {
  syncDeltaForRootNodesInDrive,
  fetchDeltaForRootNodesInDrive,
  processDeltaChangesFromGCS,
  cleanupDeltaGCSFile,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minutes",
  heartbeatTimeout: "5 minutes",
});

const { reportInitialSyncProgress, syncSucceeded, syncStarted } =
  proxyActivities<typeof sync_status>({
    startToCloseTimeout: "10 minutes",
  });

export async function fullSyncWorkflow({
  connectorId,
  startSyncTs,
  nodeIdsToSync = [],
  nodeIdsToDelete = [],
  totalCount = 0,
}: {
  connectorId: ModelId;
  startSyncTs?: number;
  nodeIdsToSync?: string[];
  nodeIdsToDelete?: string[];
  totalCount?: number;
}) {
  await syncStarted(connectorId);

  setHandler(folderUpdatesSignal, (folderUpdates: FolderUpdatesSignal[]) => {
    // If we get a signal, update the workflow state by adding/removing folder ids.
    for (const { action, folderId } of folderUpdates) {
      switch (action) {
        case "added":
          if (nodeIdsToDelete.includes(folderId)) {
            nodeIdsToDelete.splice(nodeIdsToDelete.indexOf(folderId), 1);
          }
          if (!nodeIdsToSync.includes(folderId)) {
            nodeIdsToSync.push(folderId);
          }
          break;
        case "removed":
          if (nodeIdsToSync.includes(folderId)) {
            nodeIdsToSync.splice(nodeIdsToSync.indexOf(folderId), 1);
          }
          if (!nodeIdsToDelete.includes(folderId)) {
            nodeIdsToDelete.push(folderId);
          }
          break;
        default:
        //
      }
    }
  });

  if (startSyncTs === undefined) {
    startSyncTs = new Date().getTime();
  }

  // Temp to clean up the running workflows state
  nodeIdsToSync = uniq(nodeIdsToSync);
  nodeIdsToDelete = uniq(nodeIdsToDelete);
  console.log("==============nodeIdsToSync", nodeIdsToSync);
  if (totalCount === 0) {
    // Only populate deltas if we're starting a full sync, not for continueAsNew
    await populateDeltas(connectorId, nodeIdsToSync);
  }

  let nextPageLink: string | undefined = undefined;

  while (nodeIdsToSync.length > 0) {
    // First, delete any nodes that were removed
    if (nodeIdsToDelete.length > 0) {
      const res = await microsoftDeletionActivity({
        connectorId,
        nodeIdsToDelete: nodeIdsToDelete.splice(0, nodeIdsToDelete.length),
      });
      res.forEach((nodeId) => {
        if (nodeIdsToSync.includes(nodeId)) {
          nodeIdsToSync.splice(nodeIdsToSync.indexOf(nodeId), 1);
        }
      });
    }

    // Temp to clean up the running workflows state
    nodeIdsToSync = uniq(nodeIdsToSync);

    const nodeId = nodeIdsToSync.pop();

    if (!nodeId) {
      // All nodes have been removed by previous activity, breaking
      break;
    }

    do {
      const res = await syncFiles({
        connectorId,
        parentInternalId: nodeId,
        startSyncTs,
        nextPageLink,
      });
      totalCount += res.count;
      nodeIdsToSync = nodeIdsToSync.concat(res.childNodes);
      nextPageLink = res.nextLink;

      await reportInitialSyncProgress(
        connectorId,
        `Synced ${totalCount} files`
      );
    } while (nextPageLink);

    await markNodeAsSeen(connectorId, nodeId);

    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof fullSyncWorkflow>({
        connectorId,
        nodeIdsToSync,
        nodeIdsToDelete,
        totalCount,
        startSyncTs,
      });
    }
  }

  // Temp to clean up the running workflows state
  nodeIdsToDelete = uniq(nodeIdsToDelete);

  if (nodeIdsToDelete.length > 0) {
    await microsoftDeletionActivity({
      connectorId,
      nodeIdsToDelete: nodeIdsToDelete.splice(0, nodeIdsToDelete.length),
    });
  }

  await syncSucceeded(connectorId);

  if (nodeIdsToSync.length > 0 || nodeIdsToDelete.length > 0) {
    await continueAsNew<typeof fullSyncWorkflow>({
      connectorId,
      nodeIdsToSync,
      nodeIdsToDelete,
      totalCount,
      startSyncTs,
    });
  }
}

// Legacy workflow, use incrementalSyncWorkflowV2 instead from now on.
export async function incrementalSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await syncStarted(connectorId);
  const nodeIdsToSync = await getRootNodesToSync(connectorId);
  const groupedItems = await groupRootItemsByDriveId(nodeIdsToSync);

  const startSyncTs = new Date().getTime();
  for (const nodeId of Object.keys(groupedItems)) {
    await syncDeltaForRootNodesInDrive({
      connectorId,
      driveId: nodeId,
      rootNodeIds: groupedItems[nodeId] as string[],
      startSyncTs,
    });
  }
}

export async function incrementalSyncWorkflowV2({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await syncStarted(connectorId);

  const nodeIdsToSync = await getRootNodesToSync(connectorId);

  const groupedItems = await groupRootItemsByDriveId(nodeIdsToSync);

  const startSyncTs = new Date().getTime();
  for (const nodeId of Object.keys(groupedItems)) {
    // Check if this is a drive node - delta sync only applies to drives
    const { nodeType } = typeAndPathFromInternalId(nodeId);
    
    if (nodeType !== "drive") {
      // For non-drive items (teams, channels, etc.), skip delta processing
      // These will be handled by the regular full sync instead
      console.log(`Skipping delta processing for non-drive node ${nodeId} (type: ${nodeType})`);
      continue;
    }
    
    // Step 1: Fetch delta data and upload to GCS
    const { gcsFilePath } = await fetchDeltaForRootNodesInDrive({
      connectorId,
      driveId: nodeId,
      rootNodeIds: groupedItems[nodeId] as string[],
    });

    // Skip processing if no delta data was fetched
    if (!gcsFilePath) {
      console.log(`No delta data to process for drive ${nodeId}, skipping`);
      continue;
    }

    // Step 2: Process the changes from GCS in batches
    let cursor: number | null = 0;

    try {
      while (cursor !== null) {
        const { nextCursor } = await processDeltaChangesFromGCS({
          connectorId,
          driveId: nodeId,
          gcsFilePath,
          startSyncTs,
          cursor,
        });

        cursor = nextCursor;

        // Add a small delay between batches to prevent overwhelming the system
        if (cursor !== null) {
          await sleep("1 second");
        }
      }
    } catch (error) {
      console.error(
        `Error processing delta changes for drive ${nodeId}:`,
        error
      );
      throw error; // Re-throw to fail the workflow
    } finally {
      // Step 3: Clean up the temporary GCS file (always runs)
      await cleanupDeltaGCSFile({
        connectorId,
        driveId: nodeId,
        gcsFilePath,
      });
    }
  }

  await syncSucceeded(connectorId);

  await sleep("5 minutes");
  await continueAsNew<typeof incrementalSyncWorkflow>({
    connectorId,
  });
}

export async function microsoftGarbageCollectionWorkflow({
  connectorId,
}: {
  connectorId: number;
}) {
  const startGarbageCollectionTs = new Date().getTime();
  let idCursor: number | null = 0;
  while (idCursor !== null) {
    idCursor = await microsoftGarbageCollectionActivity({
      connectorId,
      idCursor,
      startGarbageCollectionTs,
    });
    await sleep("30 seconds");
  }
}

export function microsoftFullSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-fullSync-${connectorId}`;
}

export function microsoftFullSyncSitesWorkflowId(connectorId: ModelId) {
  return `microsoft-fullSync-sites-${connectorId}`;
}

export function microsoftIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-incrementalSync-${connectorId}`;
}

export function microsoftGarbageCollectionWorkflowId(connectorId: ModelId) {
  return `microsoft-garbageCollection-${connectorId}`;
}
