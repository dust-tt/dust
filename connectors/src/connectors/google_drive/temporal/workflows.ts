import { proxyActivities, setHandler } from "@temporalio/workflow";
import { sign } from "crypto";

import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import { ModelId } from "@connectors/lib/models";
import type * as sync_status from "@connectors/lib/sync_status";
import { DataSourceConfig } from "@connectors/types/data_source_config";

import { newFoldersSelectionSignal } from "./signals";

const { syncFiles, getDrivesIds, incrementalSync } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
});

const { reportInitialSyncProgress, syncSucceeded } = proxyActivities<
  typeof sync_status
>({
  startToCloseTimeout: "10 minutes",
});

export async function googleDriveFullSync(
  connectorId: ModelId,
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig
) {
  // signal handler to restart the sync if the folders selection changes.
  let signaled = false;
  setHandler(newFoldersSelectionSignal, () => {
    console.log("Folders changed, should sync again.");
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    let totalCount = 0;
    let nextPageToken: string | undefined = undefined;
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
        nextPageToken
      );
      nextPageToken = res.nextPageToken ? res.nextPageToken : undefined;
      totalCount += res.count;
      await reportInitialSyncProgress(
        connectorId,
        `Synced ${totalCount} files`
      );
    } while (nextPageToken);
  }
  await syncSucceeded(connectorId);
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
  await syncSucceeded(connectorId);
  console.log("googleDriveIncrementalSync done for connectorId", connectorId);
}

export function googleDriveIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-IncrementalSync-${connectorId}`;
}
