import {
  continueAsNew,
  executeChild,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import { ModelId } from "@connectors/lib/models";
import type * as sync_status from "@connectors/lib/sync_status";
import { DataSourceConfig } from "@connectors/types/data_source_config";

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
      args: [connectorId, startSyncTs],
      memo: workflowInfo().memo,
    });
  }
  console.log("googleDriveFullSync done for connectorId", connectorId);
}

export function googleDriveFullSyncWorkflowId(connectorId: string) {
  return `googleDrive-fullSync-${connectorId}`;
}

export async function googleDriveIncrementalSync(
  connectorId: ModelId,
  dataSourceConfig: DataSourceConfig,
  pass: {
    // Number of times to run the incremental sync workflow.
    // There is sometimes a delay between the time we receive a Google Drive webhook
    // and the time the changes are actually available in the Gdrive API.
    // So we run the incremental sync workflow multiple times to increase the chances of catching the changes.
    no: number;
    delay: number;
  }
) {
  pass.no = pass.no - 1;
  let signaled = false;
  let debounceCount = 0;
  setHandler(newWebhookSignal, () => {
    console.log("Got a new webhook ");
    signaled = true;
  });
  while (signaled) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount++;
      if (debounceCount < 30) {
        continue;
      }
    }
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
  }

  await syncSucceeded(connectorId);
  console.log("googleDriveIncrementalSync done for connectorId", connectorId);
  if (pass.no > 0) {
    await sleep(pass.delay);
    await executeChild(googleDriveIncrementalSync, {
      workflowId: workflowInfo().workflowId,
      args: [connectorId, dataSourceConfig, pass],
      memo: workflowInfo().memo,
    });
  }
}

export function googleDriveIncrementalSyncWorkflowId(connectorId: string) {
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
