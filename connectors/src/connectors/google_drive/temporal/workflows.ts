import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  startChild,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import { ModelId } from "@connectors/lib/models";
import type * as sync_status from "@connectors/lib/sync_status";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { newFoldersSelectionSignal, newWebhookSignal } from "./signals";

const {
  syncFiles,
  getDrivesIds,
  incrementalSync,
  garbageCollector,
  getFoldersToSync,
  renewWebhooks,
  populateSyncTokens,
  garbageCollectorFinished,
  getLastGCTime,
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
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig,
  garbageCollect = true
) {
  // signal handler to restart the sync if the folders selection changes.
  let signaled = false;
  setHandler(newFoldersSelectionSignal, () => {
    console.log("Folders changed, should sync again.");
    signaled = true;
  });
  // Running the incremental sync workflow before the full sync to populate the
  // Google Drive sync tokens.
  await populateSyncTokens(connectorId);

  while (signaled) {
    signaled = false;
    let totalCount = 0;
    let nextPageToken: string | undefined = undefined;
    let foldersToBrowse: string[] = await getFoldersToSync(connectorId);
    while (foldersToBrowse.length > 0) {
      const folderId = foldersToBrowse.pop();
      if (!folderId) {
        throw new Error("folderId should be defined");
      }
      do {
        if (signaled) {
          console.log(
            "Folders selection changed, should start the sync all over again."
          );
          break;
        }
        const res = await syncFiles(
          connectorId,
          nangoConnectionId,
          dataSourceConfig,
          folderId,
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
    }
  }
  await syncSucceeded(connectorId);

  if (garbageCollect) {
    await executeChild(googleDriveGarbageCollectorWorkflow.name, {
      workflowId: googleDriveGarbageCollectorWorkflowId(connectorId),
      args: [connectorId, nangoConnectionId, dataSourceConfig],
    });
  }
  console.log("googleDriveFullSync done for connectorId", connectorId);
}

export function googleDriveFullSyncWorkflowId(connectorId: string) {
  return `googleDrive-fullSync-${connectorId}`;
}

export async function googleDriveIncrementalSync(
  connectorId: ModelId,
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig
) {
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
    const drivesIds = await getDrivesIds(nangoConnectionId);
    for (const googleDrive of drivesIds) {
      let changeCount: number | undefined = undefined;
      do {
        changeCount = await incrementalSync(
          connectorId,
          nangoConnectionId,
          dataSourceConfig,
          googleDrive.id
        );
      } while (changeCount && changeCount > 0);
    }
  }

  await syncSucceeded(connectorId);
  const lastGCTime = await getLastGCTime(connectorId);
  if (lastGCTime + 60 * 60 * 24 * 1000 < new Date().getTime()) {
    await startChild(googleDriveGarbageCollectorWorkflow.name, {
      workflowId: googleDriveGarbageCollectorWorkflowId(connectorId),
      args: [connectorId, nangoConnectionId, dataSourceConfig],
      parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
    });
  }
  console.log("googleDriveIncrementalSync done for connectorId", connectorId);
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
  connectorId: ModelId
) {
  const gcTs = new Date().getTime();

  let processed = 0;
  do {
    processed = await garbageCollector(connectorId, gcTs);
  } while (processed > 0);

  await garbageCollectorFinished(connectorId);
}

export function googleDriveGarbageCollectorWorkflowId(connectorId: ModelId) {
  return `googleDrive-garbageCollector-${connectorId}`;
}
