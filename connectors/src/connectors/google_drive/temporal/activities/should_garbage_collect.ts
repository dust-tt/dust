import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { getAuthObject } from "@connectors/connectors/google_drive/temporal/utils";
import { GoogleDriveFoldersModel } from "@connectors/lib/models/google_drive";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

// Check if we still have access to all the selected folder we are
// supposed to sync.
// If we don't have access to one of them, we should garbage collect.
export async function shouldGarbageCollect(connectorId: ModelId) {
  const selectedFolder = await GoogleDriveFoldersModel.findAll({
    where: {
      connectorId: connectorId,
    },
  });
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const authCredentials = await getAuthObject(connector.connectionId);
  for (const folder of selectedFolder) {
    const remoteFolder = await getGoogleDriveObject({
      connectorId,
      authCredentials,
      driveObjectId: folder.folderId,
    });
    if (!remoteFolder) {
      return true;
    }
  }

  return false;
}
