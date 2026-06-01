import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import type { FolderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import type * as sync_status from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";
import { assertNever } from "@temporalio/common/lib/type-helpers";
import type { ChildWorkflowHandle } from "@temporalio/workflow";
import {
  continueAsNew,
  executeChild,
  isCancellation,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";
import uniq from "lodash/uniq";

import { concurrentExecutor } from "../../../lib/async_utils";
import { GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID } from "../lib/consts";
import {
  GDRIVE_INCREMENTAL_SYNC_INTERVAL_MS,
  GDRIVE_MAX_CONCURRENT_FOLDER_SYNCS,
} from "./config";
import { folderUpdatesSignal } from "./signals";

const {
  cancelChildWorkflow,
  getDrivesToSync,
  garbageCollector,
  getFilesCountForSync,
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
  startToCloseTimeout: "180 minutes",
  heartbeatTimeout: "20 minutes",
});

// Temporarily increase timeout on syncFiles until table upsertion is moved to the upsert queue.
const { syncFiles } = proxyActivities<typeof activities>({
  startToCloseTimeout: "180 minutes",
  heartbeatTimeout: "5 minutes",
});

const {
  clearInitialSyncProgress,
  reportInitialSyncProgress,
  syncSucceeded,
  syncStarted,
} = proxyActivities<typeof sync_status>({
  startToCloseTimeout: "10 minutes",
});

export function googleDriveFullSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-fullSync-${connectorId}`;
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

/**
 * Child workflow that syncs one selected root folder subtree.
 *
 * It explores the folder tree breadth-first: the workflow keeps a queue of folders to browse,
 * syncs files from the current folder page by page, adds discovered subfolders to the queue, and
 * stops once the queue is empty.
 */
export async function googleDriveFolderSync({
  connectorId,
  rootFolderId,
  startSyncTs,
  mimeTypeFilter,
  foldersToBrowse = [],
  totalCount = 0,
}: {
  connectorId: ModelId;
  rootFolderId: string;
  startSyncTs: number;
  mimeTypeFilter?: string[];
  foldersToBrowse?: string[];
  totalCount?: number;
}) {
  // Initialize with root folder if not resuming
  if (foldersToBrowse.length === 0) {
    foldersToBrowse = [rootFolderId];
  }

  let nextPageToken: string | undefined = undefined;

  foldersToBrowse = uniq(foldersToBrowse);

  // Process all folders in this subtree
  while (foldersToBrowse.length > 0) {
    const folder = foldersToBrowse.pop();
    if (!folder) {
      throw new Error("folderId should be defined");
    }

    // Sync all files in this folder (with pagination)
    do {
      const res: Awaited<ReturnType<typeof activities.syncFiles>> =
        await syncFiles(
          connectorId,
          folder,
          startSyncTs,
          nextPageToken,
          mimeTypeFilter
        );
      nextPageToken = res.nextPageToken ? res.nextPageToken : undefined;
      totalCount += res.count;
      // Add discovered subfolders to the queue
      foldersToBrowse = foldersToBrowse.concat(res.subfolders);
    } while (nextPageToken);

    // Mark folder as visited
    await markFolderAsVisited(connectorId, folder, startSyncTs);

    // Continue as new if history is getting too large
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof googleDriveFolderSync>({
        connectorId,
        rootFolderId,
        startSyncTs,
        mimeTypeFilter,
        foldersToBrowse,
        totalCount,
      });
    }

    // Deduplicate folders
    foldersToBrowse = uniq(foldersToBrowse);
  }
}

export function googleDriveFolderSyncWorkflowId(
  connectorId: ModelId,
  folderId: string
): string {
  return `googleDrive-fullSync-${connectorId}-folder-${folderId}`;
}

/**
 * The Google Drive full sync workflow first gets the selected folders to explore for
 * synchronization, unless it was started for a specific folder subset.
 *
 * V2 is a coordinator: it populates sync tokens, upserts the shared-with-me folder, and launches
 * one child workflow per selected root folder so subtrees can sync in parallel. Each child owns the
 * breadth-first traversal of its subtree.
 *
 * If this workflow receives folder update signals while it is running, it tracks added folders for
 * the next run and cancels running child workflows for removed folders. At the end, it starts the
 * garbage collector to delete files that remain in our database but should not be synced anymore.
 *
 * @param foldersToBrowse - Pass `null` to sync all folders from DB, or specific folder IDs to sync only those.
 */
export async function googleDriveFullSyncV2({
  connectorId,
  garbageCollect = true,
  startSyncTs = undefined,
  mimeTypeFilter,
  foldersToBrowse = null,
}: {
  connectorId: ModelId;
  garbageCollect: boolean;
  startSyncTs: number | undefined;
  mimeTypeFilter?: string[];
  foldersToBrowse?: string[] | null;
}) {
  // Initialize sync timestamp
  if (!startSyncTs) {
    await syncStarted(connectorId);
    startSyncTs = new Date().getTime();
    await clearInitialSyncProgress(connectorId);
  }

  // Populate sync tokens before starting
  await populateSyncTokens(connectorId);

  // Get folders to sync - use foldersToBrowse if provided, otherwise fetch all from DB
  const folderIds =
    foldersToBrowse !== null
      ? foldersToBrowse
      : await getFoldersToSync(connectorId);

  // Upsert shared with me folder
  await upsertSharedWithMeFolder(connectorId);

  // Track folder changes that arrive during sync for next run
  const addedFoldersForNextRun = new Set<string>();
  const removedFoldersForNextRun = new Set<string>();
  let syncHasStarted = false;
  let syncCompleted = false;

  // Track running workflows for cancellation
  const runningFolderWorkflows: Record<
    string,
    {
      handle: ChildWorkflowHandle<typeof googleDriveFolderSync>;
      workflowId: string;
    }
  > = {};

  // Set up signal handler for folder additions/removals
  setHandler(folderUpdatesSignal, (folderUpdates: FolderUpdatesSignal[]) => {
    for (const { action, folderId } of folderUpdates) {
      switch (action) {
        case "added": {
          if (syncHasStarted) {
            addedFoldersForNextRun.add(folderId);
            removedFoldersForNextRun.delete(folderId);
          }
          break;
        }
        case "removed": {
          if (syncHasStarted) {
            addedFoldersForNextRun.delete(folderId);
            removedFoldersForNextRun.add(folderId);
            const folderWorkflow = runningFolderWorkflows[folderId];
            if (folderWorkflow) {
              void cancelChildWorkflow(folderWorkflow.workflowId);
              delete runningFolderWorkflows[folderId];
            }
          }
          break;
        }
        default: {
          assertNever(
            `Unexpected signal action ${action} received for Google Drive full sync V2 workflow.`,
            action
          );
        }
      }
    }
  });

  syncHasStarted = true;

  // Start progress reporting task (runs in parallel with child workflows)
  const progressReporting = async () => {
    if (folderIds.length === 0) {
      return;
    }

    while (!syncCompleted) {
      await sleep("30 seconds");
      if (syncCompleted) {
        break;
      }

      // Count total files synced so far in this run
      const totalFilesSynced = await getFilesCountForSync(
        connectorId,
        startSyncTs
      );
      if (totalFilesSynced > 0) {
        await reportInitialSyncProgress(
          connectorId,
          `Synced ${totalFilesSynced} files`
        );
      }
    }
  };

  const progressReportingTask = progressReporting();

  // Launch all folder sync workflows with bounded concurrency
  await concurrentExecutor(
    folderIds,
    async (folderId) => {
      // Skip if folder was removed before we could start
      if (removedFoldersForNextRun.has(folderId)) {
        return;
      }

      const childWorkflowId = googleDriveFolderSyncWorkflowId(
        connectorId,
        folderId
      );

      let handle: ChildWorkflowHandle<typeof googleDriveFolderSync>;
      try {
        handle = await startChild(googleDriveFolderSync, {
          workflowId: childWorkflowId,
          searchAttributes: { connectorId: [connectorId] },
          args: [
            {
              connectorId,
              rootFolderId: folderId,
              startSyncTs,
              mimeTypeFilter,
            },
          ],
          memo: workflowInfo().memo,
        });
      } catch (err) {
        if (
          err instanceof Error &&
          err.name === "WorkflowExecutionAlreadyStartedError"
        ) {
          // Workflow already running for this folder, it will be synced by that execution
          return;
        }
        throw err;
      }

      runningFolderWorkflows[folderId] = {
        handle,
        workflowId: childWorkflowId,
      };

      // Check again in case a removal signal arrived while starting
      if (removedFoldersForNextRun.has(folderId)) {
        void cancelChildWorkflow(childWorkflowId);
        delete runningFolderWorkflows[folderId];
        return;
      }

      try {
        await handle.result();
      } catch (err) {
        if (!isCancellation(err)) {
          throw err;
        }
        // Child workflow was cancelled (e.g., folder was removed during sync)
      } finally {
        delete runningFolderWorkflows[folderId];
      }
    },
    { concurrency: GDRIVE_MAX_CONCURRENT_FOLDER_SYNCS }
  );

  // Mark sync as completed - any signals from now on will be queued for next run
  syncCompleted = true;

  await progressReportingTask;

  const finalFilesSynced = await getFilesCountForSync(connectorId, startSyncTs);
  await syncSucceeded(connectorId);
  await clearInitialSyncProgress(
    connectorId,
    `googleDriveFullSyncV2 completed with ${finalFilesSynced} files`
  );

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

  // If folders were added during sync, restart workflow to handle them
  if (addedFoldersForNextRun.size > 0 || removedFoldersForNextRun.size > 0) {
    await continueAsNew<typeof googleDriveFullSyncV2>({
      connectorId,
      garbageCollect: true,
      startSyncTs: undefined,
      mimeTypeFilter,
      foldersToBrowse: [...addedFoldersForNextRun],
    });
  }
}

/**
 * Child workflow that handles incremental sync for a single drive.
 * Processes all changes for the drive with pagination, and launches folder sync for new folders.
 */
export async function googleDriveIncrementalSyncPerDrive({
  connectorId,
  driveId,
  isShared,
  startSyncTs,
  nextPageToken,
}: {
  connectorId: ModelId;
  driveId: string;
  isShared: boolean;
  startSyncTs: number;
  nextPageToken: string | undefined;
}) {
  let currentToken = nextPageToken;

  // Process all changes for this drive with pagination
  do {
    const syncRes = await incrementalSync(
      connectorId,
      driveId,
      isShared,
      startSyncTs,
      currentToken
    );

    if (syncRes) {
      const newFolders = syncRes.newFolders;

      // Launch folder sync for each new folder
      if (newFolders.length > 0) {
        await concurrentExecutor(
          newFolders,
          async (folderId) => {
            const workflowId = googleDriveFolderSyncWorkflowId(
              connectorId,
              folderId
            );

            try {
              const handle = await startChild(googleDriveFolderSync, {
                workflowId,
                searchAttributes: { connectorId: [connectorId] },
                args: [
                  {
                    connectorId,
                    rootFolderId: folderId,
                    startSyncTs,
                  },
                ],
                memo: workflowInfo().memo,
              });
              await handle.result();
            } catch (err) {
              if (
                err instanceof Error &&
                err.name === "WorkflowExecutionAlreadyStartedError"
              ) {
                // Workflow already running, folder will be synced by that execution
                return;
              } else {
                throw err;
              }
            }
          },
          { concurrency: GDRIVE_MAX_CONCURRENT_FOLDER_SYNCS }
        );
      }
      currentToken = syncRes.nextPageToken;
    } else {
      break;
    }

    // Will restart exactly where it was.
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof googleDriveIncrementalSyncPerDrive>({
        connectorId,
        driveId,
        isShared,
        startSyncTs,
        nextPageToken: currentToken,
      });
    }
  } while (currentToken);
}

export function googleDriveIncrementalSyncPerDriveWorkflowId(
  connectorId: ModelId,
  driveId: string
): string {
  return `googleDrive-incrementalSync-${connectorId}-drive-${driveId}`;
}

/**
 * The Google Drive incremental sync workflow wakes up at a fixed interval and synchronizes delta
 * changes. It asks `getDrivesToSync` for shared drives that are currently due, adds userspace, and
 * launches one child workflow per drive so drives can sync in parallel.
 *
 * Each per-drive child uses the Drive changes API to get files that were created, deleted, or
 * updated since the last sync token. It then syncs relevant files when they belong to selected
 * folders and launches folder sync workflows for newly discovered folders. This incremental sync is
 * not webhook-based.
 */
export async function googleDriveIncrementalSyncV2(
  connectorId: ModelId,
  startSyncTs: number | undefined = undefined
) {
  if (!startSyncTs) {
    await syncStarted(connectorId);
    startSyncTs = new Date().getTime();
  }

  // Get drives to sync
  const drives = await getDrivesToSync(connectorId);
  const drivesToSync = drives
    .map((drive) => ({
      id: drive.id,
      isShared: drive.isSharedDrive,
    }))
    // Include userspace (non-shared drives)
    .concat({
      id: GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID,
      isShared: false,
    });

  // Launch child workflows in parallel - one per drive
  await concurrentExecutor(
    drivesToSync,
    async (googleDrive) => {
      const handle = await startChild(googleDriveIncrementalSyncPerDrive, {
        workflowId: googleDriveIncrementalSyncPerDriveWorkflowId(
          connectorId,
          googleDrive.id
        ),
        searchAttributes: {
          connectorId: [connectorId],
        },
        args: [
          {
            connectorId,
            driveId: googleDrive.id,
            isShared: googleDrive.isShared,
            startSyncTs,
            nextPageToken: undefined,
          },
        ],
        memo: workflowInfo().memo,
      });
      return handle.result();
    },
    { concurrency: GDRIVE_MAX_CONCURRENT_FOLDER_SYNCS }
  );

  // Check if garbage collection is needed
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

  // Sleep and continue
  await sleep(GDRIVE_INCREMENTAL_SYNC_INTERVAL_MS);
  await continueAsNew<typeof googleDriveIncrementalSyncV2>(connectorId);
}
