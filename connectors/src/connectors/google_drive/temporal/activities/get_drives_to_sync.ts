import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import type { LightGoogleDrive } from "@connectors/connectors/google_drive/temporal/activities/common/types";
import { getDrives } from "@connectors/connectors/google_drive/temporal/activities/common/utils";
import { getAuthObject } from "@connectors/connectors/google_drive/temporal/utils";
import { GoogleDriveFoldersModel } from "@connectors/lib/models/google_drive";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

// Get the list of drives that have folders selected for sync.
export async function getDrivesToSync(
  connectorId: ModelId
): Promise<LightGoogleDrive[]> {
  const selectedFolders = await GoogleDriveFoldersModel.findAll({
    where: {
      connectorId: connectorId,
    },
  });
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const allSharedDrives = await getDrives(connectorId);
  const authCredentials = await getAuthObject(connector.connectionId);
  const drives: Record<string, LightGoogleDrive> = {};

  for (const folder of selectedFolders) {
    const remoteFolder = await getGoogleDriveObject({
      connectorId,
      authCredentials,
      driveObjectId: folder.folderId,
    });
    if (remoteFolder) {
      if (!remoteFolder.driveId) {
        throw new Error(`Folder ${folder.folderId} does not have a driveId.`);
      }
      // A selected folder can be in a shared drive we don't have access to,
      // so we need to filter them out.
      // This is the case for files "shared with me" for example.
      if (allSharedDrives.find((d) => d.id === remoteFolder.driveId)) {
        drives[remoteFolder.driveId] = {
          id: remoteFolder.driveId,
          name: remoteFolder.name,
          isSharedDrive: remoteFolder.isInSharedDrive,
        };
      }
    }
  }

  return Object.values(drives);
}
