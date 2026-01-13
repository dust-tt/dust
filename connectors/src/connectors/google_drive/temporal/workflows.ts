import { assertNever } from "@temporalio/common/lib/type-helpers";
import type { ChildWorkflowHandle } from "@temporalio/workflow";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";
import { uniq } from "lodash";

import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import type { FolderUpdatesSignal } from "@connectors/connectors/google_drive/temporal/signals";
import type * as sync_status from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";

import { concurrentExecutor } from "../../../lib/async_utils";
import { GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID } from "../lib/consts";
import { GDRIVE_MAX_CONCURRENT_FOLDER_SYNCS } from "./config";
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
 *
 * @param foldersToBrowse - Pass `null` to sync all folders from DB, or specific folder IDs to sync only those.
 */
export async function googleDriveFullSync({
  connectorId,
  garbageCollect = true,
  foldersToBrowse = null,
  totalCount = 0,
  startSyncTs = undefined,
  mimeTypeFilter,
}: {
  connectorId: ModelId;
  garbageCollect: boolean;
  foldersToBrowse: string[] | null;
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

  // Initialize foldersToBrowse from DB if null, otherwise use provided list
  let foldersQueue: string[] =
    foldersToBrowse ?? (await getFoldersToSync(connectorId));

  setHandler(folderUpdatesSignal, (folderUpdates: FolderUpdatesSignal[]) => {
    // If we get a signal, update the workflow state by adding/removing folder ids.
    for (const { action, folderId } of folderUpdates) {
      switch (action) {
        case "added":
          if (!foldersQueue.includes(folderId)) {
            foldersQueue.push(folderId);
          }
          break;
        case "removed":
          foldersQueue.splice(foldersQueue.indexOf(folderId), 1);
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
  foldersQueue = uniq(foldersQueue);

  while (foldersQueue.length > 0) {
    const folder = foldersQueue.pop();
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
      foldersQueue = foldersQueue.concat(res.subfolders);

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
        foldersToBrowse: foldersQueue,
        totalCount,
        startSyncTs,
        mimeTypeFilter,
      });
    }

    // Temp to clean up the running workflows state
    foldersQueue = uniq(foldersQueue);
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

  let currentToken = nextPageToken;

  while (drivesToSync.length > 0) {
    const googleDrive = drivesToSync[0];
    if (!googleDrive) {
      throw new Error("googleDrive should be defined");
    }

    do {
      const syncRes = await incrementalSync(
        connectorId,
        googleDrive.id,
        googleDrive.isShared,
        startSyncTs,
        currentToken
      );

      if (syncRes) {
        const foldersToBrowse = syncRes.newFolders;

        if (foldersToBrowse.length > 0) {
          await executeChild(googleDriveFullSync, {
            workflowId: `googleDrive-newFolderSync-${startSyncTs}-${connectorId}`,
            searchAttributes: {
              connectorId: [connectorId],
            },
            args: [
              {
                connectorId: connectorId,
                garbageCollect: false,
                foldersToBrowse,
                totalCount: 0,
                startSyncTs: startSyncTs,
                mimeTypeFilter: undefined,
              },
            ],
            memo: workflowInfo().memo,
          });
        }

        currentToken = syncRes.nextPageToken;
      } else {
        break;
      }

      // Will restart exactly where it was.
      if (workflowInfo().historyLength > 4000) {
        await continueAsNew<typeof googleDriveIncrementalSync>(
          connectorId,
          startSyncTs,
          drivesToSync,
          currentToken
        );
      }
    } while (currentToken);

    // We have completed a drive, move to the next one.
    // Clear the nextPageToken to start from the beginning of the next drive.
    // Remove the drive from the list of drives to sync.
    currentToken = undefined;
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

/**
 * Child workflow that syncs a single root folder and all its subfolders (subtree).
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

  // Process all folders in this subtree
  while (foldersToBrowse.length > 0) {
    const folder = foldersToBrowse.pop();
    if (!folder) {
      throw new Error("folderId should be defined");
    }

    // Sync all files in this folder (with pagination)
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
 * V2 Full Sync Coordinator Workflow - launches child workflows for each selected folder
 * to enable parallel processing. This is the gradual migration version that runs
 * alongside the legacy googleDriveFullSync workflow.
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

  // Track pending folder changes that arrive after sync completes.
  const addedFoldersForNextRun = new Set<string>();
  const removedFoldersForNextRun = new Set<string>();
  let syncCompleted = false;

  const runningFolderWorkflows: Record<
    string,
    {
      handle: ChildWorkflowHandle<typeof googleDriveFolderSync>;
      workflowId: string;
    }
  > = {};
  // Set preserves insertion order in JS, so we can use it as a FIFO queue with O(1) membership checks
  const pendingFolderIds = new Set<string>(folderIds);

  // Helper to start a child workflow for a folder (does not wait for completion)
  const launchFolderWorkflow = async (folderId: string) => {
    const childWorkflowId = googleDriveFolderSyncWorkflowId(
      connectorId,
      folderId
    );

    const handle = await startChild(googleDriveFolderSync, {
      workflowId: childWorkflowId,
      // This is only in the case we add/remove/re-add a folder to the sync list, and workflow has not been cancelled yet.
      workflowIdReusePolicy: "TERMINATE_IF_RUNNING",
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

    runningFolderWorkflows[folderId] = {
      handle,
      workflowId: childWorkflowId,
    };
  };

  // Helper to start workflows up to the concurrency limit
  const fillConcurrencySlots = async () => {
    while (
      pendingFolderIds.size > 0 &&
      Object.keys(runningFolderWorkflows).length <
        GDRIVE_MAX_CONCURRENT_FOLDER_SYNCS
    ) {
      // Get first element from Set (preserves insertion order)
      const folderId = pendingFolderIds.values().next().value;
      if (folderId) {
        pendingFolderIds.delete(folderId);
        if (!(folderId in runningFolderWorkflows)) {
          await launchFolderWorkflow(folderId);
        }
      }
    }
  };

  // Set up signal handler for folder additions/removals
  setHandler(folderUpdatesSignal, (folderUpdates: FolderUpdatesSignal[]) => {
    let shouldFillSlots = false;

    for (const { action, folderId } of folderUpdates) {
      switch (action) {
        case "added": {
          if (syncCompleted) {
            // Sync already done, queue for next run
            if (removedFoldersForNextRun.has(folderId)) {
              removedFoldersForNextRun.delete(folderId);
            } else {
              addedFoldersForNextRun.add(folderId);
            }
          } else {
            if (
              !(folderId in runningFolderWorkflows) &&
              !pendingFolderIds.has(folderId)
            ) {
              pendingFolderIds.add(folderId);
              shouldFillSlots = true;
            }
          }
          break;
        }
        case "removed": {
          if (syncCompleted) {
            // Sync already done, queue for next run
            if (addedFoldersForNextRun.has(folderId)) {
              addedFoldersForNextRun.delete(folderId);
            } else {
              removedFoldersForNextRun.add(folderId);
            }
          } else {
            // Remove from pending queue if present
            pendingFolderIds.delete(folderId);
            // Cancel running workflow if present
            const folderWorkflow = runningFolderWorkflows[folderId];
            if (folderWorkflow) {
              cancelChildWorkflow(folderWorkflow.workflowId).catch(() => {
                // Workflow may have already completed, ignore
              });
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

    // Start workflows immediately if slots are available
    if (shouldFillSlots) {
      void fillConcurrencySlots();
    }
  });

  // Start progress reporting task (runs in parallel with child workflows)
  const progressReporting = async () => {
    if (folderIds.length === 0) {
      return;
    }

    while (!syncCompleted) {
      await sleep("30 seconds");
      if (syncCompleted) break;

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

  // Main loop: process folders with bounded concurrency
  // Fill initial slots, then wait for completions and refill
  await fillConcurrencySlots();

  while (
    Object.keys(runningFolderWorkflows).length > 0 ||
    pendingFolderIds.size > 0
  ) {
    // Wait for at least one workflow to complete
    if (Object.keys(runningFolderWorkflows).length > 0) {
      // Race all running workflows - first one to complete/fail wins
      const completedFolderId = await Promise.race(
        Object.entries(runningFolderWorkflows).map(async ([folderId, wf]) => {
          try {
            await wf.handle.result();
          } catch {
            // Workflow failed or was cancelled, still counts as done
          }
          return folderId;
        })
      );

      // Remove completed workflow
      delete runningFolderWorkflows[completedFolderId];

      // Immediately fill slots with pending folders
      await fillConcurrencySlots();
    }
  }

  // Mark sync as completed - any signals from now on will be queued for next run
  syncCompleted = true;

  await progressReportingTask;

  const finalFilesSynced = await getFilesCountForSync(connectorId, startSyncTs);
  await reportInitialSyncProgress(
    connectorId,
    `Synced ${finalFilesSynced} files`
  );

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

  // If folders were added during GC, restart a new workflow to handle them
  if (addedFoldersForNextRun.size > 0) {
    // Restart workflow to sync newly added folders
    // GC will automatically clean up removed folders based on lastSeenTs
    await continueAsNew<typeof googleDriveFullSyncV2>({
      connectorId,
      garbageCollect: true,
      startSyncTs: undefined,
      mimeTypeFilter,
      foldersToBrowse: [...addedFoldersForNextRun],
    });
  } else if (removedFoldersForNextRun.size > 0) {
    // Only removals, just re-launch GC to clean them up
    await executeChild(googleDriveGarbageCollectorWorkflow, {
      workflowId: googleDriveGarbageCollectorWorkflowId(connectorId),
      searchAttributes: {
        connectorId: [connectorId],
      },
      args: [connectorId, new Date().getTime()],
      memo: workflowInfo().memo,
    });
  }
}

export function googleDriveFullSyncV2WorkflowId(connectorId: ModelId): string {
  return `googleDrive-fullSyncV2-${connectorId}`;
}

/**
 * Child workflow that handles incremental sync for a single drive.
 * Processes all changes for the drive with pagination, and launches full sync for new folders.
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
      const foldersToBrowse = syncRes.newFolders;

      if (foldersToBrowse.length > 0) {
        await executeChild(googleDriveFullSync, {
          workflowId: `googleDrive-newFolders-${connectorId}-drive-${driveId}-${startSyncTs}`,
          searchAttributes: {
            connectorId: [connectorId],
          },
          args: [
            {
              connectorId: connectorId,
              garbageCollect: false,
              foldersToBrowse,
              totalCount: 0,
              startSyncTs: startSyncTs,
              mimeTypeFilter: undefined,
            },
          ],
          memo: workflowInfo().memo,
        });
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
 * V2 Incremental Sync Coordinator Workflow - launches one child workflow per drive for parallel processing.
 * Each child workflow handles its drive's incremental sync and new folder discovery.
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
  await sleep("5 minutes");
  await continueAsNew<typeof googleDriveIncrementalSyncV2>(connectorId);
}

export function googleDriveIncrementalSyncV2WorkflowId(
  connectorId: ModelId
): string {
  return `googleDrive-incrementalSyncV2-${connectorId}`;
}
