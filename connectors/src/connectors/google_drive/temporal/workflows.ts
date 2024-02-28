import type { ModelId } from "@dust-tt/types";
import {
  continueAsNew,
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import type * as sync_status from "@connectors/lib/sync_status";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

import { GDRIVE_INCREMENTAL_SYNC_DEBOUNCE_SEC } from "./config";
import { newWebhookSignal } from "./signals";

const {
  syncFiles,
  getDrivesIds,
  garbageCollector,
  getFoldersToSync,
  renewWebhooks,
  populateSyncTokens,
  garbageCollectorFinished,
  incrementalSync,
  markFolderAsVisited,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "20 minutes",
});

const { reportInitialSyncProgress, syncSucceeded } = proxyActivities<
  typeof sync_status
>({
  startToCloseTimeout: "10 minutes",
});

export async function googleDriveFullSync(
  connectorId: ModelId,
  dataSourceConfig: DataSourceConfig,
  garbageCollect = true,
  foldersToBrowse: string[] | undefined = undefined,
  totalCount = 0,
  startSyncTs: number | undefined = undefined
) {
  // Running the incremental sync workflow before the full sync to populate the
  // Google Drive sync tokens.
  await populateSyncTokens(connectorId);

  let nextPageToken: string | undefined = undefined;
  if (startSyncTs === undefined) {
    startSyncTs = new Date().getTime();
  }
  if (foldersToBrowse === undefined) {
    foldersToBrowse = await getFoldersToSync(connectorId);
  }

  while (foldersToBrowse.length > 0) {
    const folder = foldersToBrowse.pop();
    if (!folder) {
      throw new Error("folderId should be defined");
    }
    do {
      const res = await syncFiles(
        connectorId,
        dataSourceConfig,
        folder,
        startSyncTs,
        nextPageToken
      );
      nextPageToken = res.nextPageToken ? res.nextPageToken : undefined;
      totalCount += res.count;
      foldersToBrowse = foldersToBrowse.concat(res.subfolders);

      await reportInitialSyncProgress(
        connectorId,
        `Synced ${totalCount} files`
      );
    } while (nextPageToken);
    await markFolderAsVisited(connectorId, folder);
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof googleDriveFullSync>(
        connectorId,
        dataSourceConfig,
        garbageCollect,
        foldersToBrowse,
        totalCount,
        startSyncTs
      );
    }
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
  console.log("googleDriveFullSync done for connectorId", connectorId);
}

export function googleDriveFullSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-fullSync-${connectorId}`;
}

export async function googleDriveIncrementalSync(
  connectorId: ModelId,
  dataSourceConfig: DataSourceConfig
) {
  const maxPassCount = 2;
  const debounceMaxCount = 10;
  const debounceSleepTimeMs = GDRIVE_INCREMENTAL_SYNC_DEBOUNCE_SEC * 1000;
  const secondPassSleepStepMs = 5 * 1000;
  const secondPassSleepTimeMs = 5 * 60 * 1000;

  let signaled = false;
  let debounceCount = 0;
  let passCount = 0;

  setHandler(newWebhookSignal, () => {
    console.log("Got a new webhook ");
    signaled = true;
    passCount = 0;
  });
  while (signaled || passCount < maxPassCount) {
    signaled = false;
    await sleep(debounceSleepTimeMs);
    if (signaled) {
      debounceCount++;
      if (debounceCount < debounceMaxCount) {
        continue;
      }
    }
    // Reset the debounce count so that if we get another webhook we can debounce again.
    debounceCount = 0;
    passCount++;
    console.log("Doing pass number", passCount);
    console.log(`Processing after debouncing ${debounceCount} time(s)`);
    const drivesIds = await getDrivesIds(connectorId);
    const startSyncTs = new Date().getTime();
    for (const googleDrive of drivesIds) {
      let nextPageToken: undefined | string = undefined;
      do {
        nextPageToken = await incrementalSync(
          connectorId,
          dataSourceConfig,
          googleDrive.id,
          googleDrive.sharedDrive,
          startSyncTs,
          nextPageToken
        );
      } while (nextPageToken);
    }

    await syncSucceeded(connectorId);
    console.log("googleDriveIncrementalSync done for connectorId", connectorId);

    if (workflowInfo().historyLength > 4000) {
      // If we have been deboucing and doing second passes for more than 4000 events,
      // it means that this workflow is pretty busy and being signaled a lot, so we can safely exit and rely on the next signal to
      // start a new workflow.
      return;
    }

    if (passCount < maxPassCount) {
      let secondPassSleptTimeMs = 0;

      while (secondPassSleptTimeMs < secondPassSleepTimeMs) {
        await sleep(secondPassSleepStepMs);
        console.log("Sleeping for the second pass", secondPassSleptTimeMs);
        secondPassSleptTimeMs += secondPassSleepStepMs;
        if (signaled) {
          console.log(
            "Got a new webhook while sleeping for the second pass",
            secondPassSleptTimeMs,
            passCount
          );
          // We got another webhook, restarting from the beginning.
          break;
        }
      }
    }
  }
}

export function googleDriveIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-IncrementalSync-${connectorId}`;
}

export async function googleDriveRenewWebhooks() {
  let count = 0;
  do {
    count = await renewWebhooks(10);
  } while (count);
}

export function googleDriveRenewWebhooksWorkflowId() {
  return `googleDrive-RenewWebhook`;
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
