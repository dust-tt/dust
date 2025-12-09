import { GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID } from "@connectors/connectors/google_drive/lib/consts";
import {
  getDrives,
  getSyncPageToken,
} from "@connectors/connectors/google_drive/temporal/activities/common/utils";
import { GoogleDriveSyncTokenModel } from "@connectors/lib/models/google_drive";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export async function populateSyncTokens(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const drivesIds = await getDrives(connector.id);
  for (const drive of drivesIds) {
    const lastSyncToken = await getSyncPageToken(
      connectorId,
      drive.id,
      drive.isSharedDrive
    );
    await GoogleDriveSyncTokenModel.upsert({
      connectorId: connectorId,
      driveId: drive.id,
      syncToken: lastSyncToken,
    });
  }

  const userLandSyncToken = await getSyncPageToken(
    connectorId,
    GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID,
    false
  );
  await GoogleDriveSyncTokenModel.upsert({
    connectorId,
    driveId: GOOGLE_DRIVE_USER_SPACE_VIRTUAL_DRIVE_ID,
    syncToken: userLandSyncToken,
  });
}
