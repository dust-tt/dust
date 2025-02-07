import type { ModelId } from "@dust-tt/types";
import { assertNever } from "@temporalio/common/lib/type-helpers";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import { uniq } from "lodash";

import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import type { FolderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import type * as sync_status from "@connectors/lib/sync_status";

import { GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID } from "../lib/consts";
import { folderUpdatesSignal } from "./signals";

const {
  getDrivesToSync,
  garbageCollector,
  getFoldersToSync,
  populateSyncTokens,
  garbageCollectorFinished,
  markFolderAsVisited,
  shouldGarbageCollect,
  upsertSharedWithMeFolder,
  fixParentsConsistencyActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minutes",
});

// Hotfix: increase timeout on incrementalSync to avoid restarting ongoing activities
const { incrementalSync } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minutes",
  heartbeatTimeout: "5 minutes",
});

// Temporarily increase timeout on syncFiles until table upsertion is moved to the upsert queue.
const { syncFiles } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
});

const { reportInitialSyncProgress, syncSucceeded, syncStarted } =
  proxyActivities<typeof sync_status>({
    startToCloseTimeout: "10 minutes",
  });

/**
 * The Google Drive full sync workflow first generates a list of initial folders to explore for synchronization.
 * This list is set to a queue, which we explore in a breadth-first manner. At each iteration, we add the folders
 * discovered during the current iteration to the queue. We continue this process until the queue is empty.
 * If this workflow is called while it's running, the queue is updated using Temporal signals.
 * At the end, we start the garbage collector workflow to delete files that are still in our database but that we are not supposed
 * to sync anymore.
 */
export async function googleDriveFullSync({
  connectorId,
  garbageCollect = true,
  foldersToBrowse = [],
  totalCount = 0,
  startSyncTs = undefined,
  mimeTypeFilter,
}: {
  connectorId: ModelId;
  garbageCollect: boolean;
  foldersToBrowse: string[];
  totalCount: number;
  startSyncTs: number | undefined;
  mimeTypeFilter?: string[];
}) {
  if (!startSyncTs) {
    await syncStarted(connectorId);
    startSyncTs = new Date().getTime();
  }

  // Running the incremental sync workflow before the full sync to populate the
  // Google Drive sync tokens.
  await populateSyncTokens(connectorId);

  let nextPageToken: string | undefined = undefined;

  if (!foldersToBrowse.length) {
    foldersToBrowse = await getFoldersToSync(connectorId);
  }

  setHandler(folderUpdatesSignal, (folderUpdates: FolderUpdatesSignal[]) => {
    // If we get a signal, update the workflow state by adding/removing folder ids.
    for (const { action, folderId } of folderUpdates) {
      switch (action) {
        case "added":
          if (!foldersToBrowse.includes(folderId)) {
            foldersToBrowse.push(folderId);
          }
          break;
        case "removed":
          foldersToBrowse.splice(foldersToBrowse.indexOf(folderId), 1);
          break;
        default:
          assertNever(
            `Unexpected signal action ${action} received for Google Drive full sync workflow.`,
            action
          );
      }
    }
  });

  await upsertSharedWithMeFolder(connectorId);

  // Temp to clean up the running workflows state
  foldersToBrowse = uniq(foldersToBrowse);

  while (foldersToBrowse.length > 0) {
    const folder = foldersToBrowse.pop();
    if (!folder) {
      throw new Error("folderId should be defined");
    }
    do {
      const res = await syncFiles(
        connectorId,
        folder,
        startSyncTs,
        nextPageToken,
        mimeTypeFilter
      );
      nextPageToken = res.nextPageToken ? res.nextPageToken : undefined;
      totalCount += res.count;
      foldersToBrowse = foldersToBrowse.concat(res.subfolders);

      await reportInitialSyncProgress(
        connectorId,
        `Synced ${totalCount} files`
      );
    } while (nextPageToken);
    await markFolderAsVisited(connectorId, folder, startSyncTs);
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof googleDriveFullSync>({
        connectorId,
        garbageCollect,
        foldersToBrowse,
        totalCount,
        startSyncTs,
        mimeTypeFilter,
      });
    }

    // Temp to clean up the running workflows state
    foldersToBrowse = uniq(foldersToBrowse);
  }
  await syncSucceeded(connectorId);

  if (garbageCollect) {
    await executeChild(googleDriveGarbageCollectorWorkflow, {
      workflowId: googleDriveGarbageCollectorWorkflowId(connectorId),
      searchAttributes: {
        connectorId: [connectorId],
      },
      args: [connectorId, startSyncTs],
      memo: workflowInfo().memo,
    });
  }
}

export function googleDriveFullSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-fullSync-${connectorId}`;
}

type DrivesToSyncType = {
  id: string;
  isShared: boolean;
}[];

/**
 * The Google incremental sync workflow is running at a fixed interval and synchronize the delta changes.
 * We use the drive.changes API to get the list of files that have been created / deleted / updated since the last sync,
 * and call the syncOneFile on each one of them if they are in a list of selected folders to synchronize.
 * This incremental sync isn't webhook based
 */
export async function googleDriveIncrementalSync(
  connectorId: ModelId,
  startSyncTs: number | undefined = undefined,
  drivesToSync: DrivesToSyncType | undefined = undefined,
  nextPageToken: string | undefined = undefined
) {
  if (!startSyncTs) {
    await syncStarted(connectorId);
    startSyncTs = new Date().getTime();
  }

  if (drivesToSync === undefined) {
    const drives = await getDrivesToSync(connectorId);
    drivesToSync = drives
      .map((drive) => ({
        id: drive.id,
        isShared: drive.isSharedDrive,
      }))
      // Run incremental sync for "userspace" (aka non shared drives, non "my drive").
      .concat({
        id: GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID,
        isShared: false,
      });
  }

  while (drivesToSync.length > 0) {
    const googleDrive = drivesToSync[0];
    if (!googleDrive) {
      throw new Error("googleDrive should be defined");
    }

    do {
      nextPageToken = await incrementalSync(
        connectorId,
        googleDrive.id,
        googleDrive.isShared,
        startSyncTs,
        nextPageToken
      );

      // Will restart exactly where it was.
      if (workflowInfo().historyLength > 4000) {
        await continueAsNew<typeof googleDriveIncrementalSync>(
          connectorId,
          startSyncTs,
          drivesToSync,
          nextPageToken
        );
      }
    } while (nextPageToken);

    // We have completed a drive, move to the next one.
    // Clear the nextPageToken to start from the beginning of the next drive.
    // Remove the drive from the list of drives to sync.
    nextPageToken = undefined;
    drivesToSync.shift();
  }

  const shouldGc = await shouldGarbageCollect(connectorId);
  if (shouldGc) {
    await executeChild(googleDriveGarbageCollectorWorkflow, {
      workflowId: googleDriveGarbageCollectorWorkflowId(connectorId),
      searchAttributes: {
        connectorId: [connectorId],
      },
      args: [connectorId, startSyncTs],
      memo: workflowInfo().memo,
    });
  }

  await syncSucceeded(connectorId);

  await sleep("5 minutes");
  await continueAsNew<typeof googleDriveIncrementalSync>(connectorId);
}

export async function googleDriveGarbageCollectorWorkflow(
  connectorId: ModelId,
  gcMinTs: number
) {
  let processed = 0;
  do {
    processed = await garbageCollector(connectorId, gcMinTs);
  } while (processed > 0);

  await garbageCollectorFinished(connectorId);
}

export function googleDriveGarbageCollectorWorkflowId(connectorId: ModelId) {
  return `googleDrive-garbageCollector-${connectorId}`;
}

export function googleDriveFixParentsConsistencyWorkflowId(
  connectorId: ModelId
) {
  return `googleDrive-fixParentsConsistency-${connectorId}`;
}

export async function googleDriveFixParentsConsistencyWorkflow(
  connectorId: ModelId,
  execute: boolean
) {
  let fromId = 0;
  const startTs = new Date().getTime();
  do {
    fromId = await fixParentsConsistencyActivity({
      connectorId,
      fromId,
      execute,
      startTs,
    });
  } while (fromId > 0);
}
