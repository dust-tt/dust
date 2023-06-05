import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import { ModelId } from "@connectors/lib/models";
import type * as sync_status from "@connectors/lib/sync_status";
import { DataSourceConfig } from "@connectors/types/data_source_config";

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
  let totalCount = 0;
  let nextPageToken: string | undefined = undefined;
  do {
    const res = await syncFiles(
      connectorId,
      nangoConnectionId,
      dataSourceConfig,
      nextPageToken
    );
    nextPageToken = res.nextPageToken ? res.nextPageToken : undefined;
    totalCount += res.count;
    await reportInitialSyncProgress(connectorId, `Synced ${totalCount} files`);
  } while (nextPageToken);

  await syncSucceeded(connectorId);
  console.log("googleDriveFullSync done for connectorId", connectorId);
}

export function googleDriveFullSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-fullSync-${connectorId}`;
}

export async function googleDriveIncrementalSync(
  connectorId: ModelId,
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig
) {
  const drivesIds = await getDrivesIds(nangoConnectionId);
  for (const driveId of drivesIds) {
    let changeCount: number | undefined = undefined;
    do {
      changeCount = await incrementalSync(
        connectorId,
        nangoConnectionId,
        dataSourceConfig,
        driveId.id
      );
    } while (changeCount && changeCount > 0);
  }
  await syncSucceeded(connectorId);
  console.log("googleDriveIncrementalSync done for connectorId", connectorId);
}

export function googleDriveIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-IncrementalSync-${connectorId}`;
}
