import { executeChild, proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import { ModelId } from "@connectors/lib/models";
import type * as sync_status from "@connectors/lib/sync_status";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const { syncFiles, getDrivesIds, incrementalSync, garbageCollector } =
  proxyActivities<typeof activities>({
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
  dataSourceConfig: DataSourceConfig,
  garbageCollect = true
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

  if (garbageCollect) {
    await executeChild(googleDriveGarbageCollectorWorkflow.name, {
      workflowId: googleDriveGarbageCollectorWorkflowId(connectorId),
      args: [connectorId, nangoConnectionId, dataSourceConfig],
    });
  }
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

export async function googleDriveGarbageCollectorWorkflow(
  connectorId: ModelId
) {
  const gcTs = new Date().getTime();

  let processed = 0;
  do {
    processed = await garbageCollector(connectorId, gcTs);
  } while (processed > 0);
}

export function googleDriveGarbageCollectorWorkflowId(connectorId: ModelId) {
  return `googleDrive-garbageCollector-${connectorId}`;
}
