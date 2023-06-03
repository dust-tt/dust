import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/google_drive/temporal/activities";
import { ModelId } from "@connectors/lib/models";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const { syncFiles, getDrivesIds, incrementalSync } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
});

export async function googleDriveFullSync(
  connectorId: ModelId,
  nangoConnectionId: string,
  dataSourceConfig: DataSourceConfig
) {
  let nextPageToken: string | undefined = undefined;
  do {
    const res = await syncFiles(
      connectorId,
      nangoConnectionId,
      dataSourceConfig,
      nextPageToken
    );
    nextPageToken = res.nextPageToken ? res.nextPageToken : undefined;
  } while (nextPageToken);
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
    await incrementalSync(
      connectorId,
      nangoConnectionId,
      dataSourceConfig,
      driveId
    );
  }
}

export function googleDriveIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-IncrementalSync-${connectorId}`;
}
