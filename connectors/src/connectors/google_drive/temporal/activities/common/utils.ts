import type { drive_v3 } from "googleapis";
import type { GaxiosResponse, OAuth2Client } from "googleapis-common";

import { internalDeleteFile } from "@connectors/connectors/google_drive/lib";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import type { LightGoogleDrive } from "@connectors/connectors/google_drive/temporal/activities/common/types";
import {
  getAuthObject,
  getDriveClient,
  getMyDriveIdCached,
} from "@connectors/connectors/google_drive/temporal/utils";
import {
  GoogleDriveFiles,
  GoogleDriveSyncToken,
} from "@connectors/lib/models/google_drive";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GoogleDriveObjectType, ModelId } from "@connectors/types";

export async function deleteOneFile(
  connectorId: ModelId,
  file: GoogleDriveObjectType
) {
  const googleDriveFile = await GoogleDriveFiles.findOne({
    where: {
      connectorId: connectorId,
      driveFileId: file.id,
    },
  });
  // Only clean up files that we were syncing
  if (!googleDriveFile) {
    return;
  }
  await deleteFile(googleDriveFile);
}

export async function deleteFile(googleDriveFile: GoogleDriveFiles) {
  const connectorId = googleDriveFile.connectorId;
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  getActivityLogger(connector).info(
    {
      driveFileId: googleDriveFile.driveFileId,
      connectorId,
    },
    `Deleting Google Drive file.`
  );

  await internalDeleteFile(connector, googleDriveFile);
}

export async function getDrives(
  connectorId: ModelId
): Promise<LightGoogleDrive[]> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const drive = await getDriveClient(connector.connectionId);

  let nextPageToken: string | undefined | null = undefined;
  const authCredentials = await getAuthObject(connector.connectionId);
  const drives: LightGoogleDrive[] = [];
  const myDriveId = await getMyDriveIdCached(authCredentials);
  drives.push({ id: myDriveId, name: "My Drive", isSharedDrive: false });
  do {
    const res: GaxiosResponse<drive_v3.Schema$DriveList> =
      await drive.drives.list({
        pageSize: 100,
        fields: "nextPageToken, drives(id, name)",
        pageToken: nextPageToken,
      });
    if (res.status !== 200) {
      throw new Error(
        `Error getting drives. status_code: ${res.status}. status_text: ${res.statusText}`
      );
    }
    if (!res.data.drives) {
      throw new Error("Drives list is undefined");
    }
    for (const drive of res.data.drives) {
      if (drive.id && drive.name) {
        drives.push({ id: drive.id, name: drive.name, isSharedDrive: true });
      }
    }
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  return drives;
}

export async function getSyncPageToken(
  connectorId: ModelId,
  driveId: string,
  isSharedDrive: boolean
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const last = await GoogleDriveSyncToken.findOne({
    where: {
      connectorId: connectorId,
      driveId: driveId,
    },
  });
  if (last) {
    return last.syncToken;
  }
  const driveClient = await getDriveClient(connector.connectionId);
  let lastSyncToken = undefined;
  if (!lastSyncToken) {
    let opts: { supportsAllDrives: boolean; driveId?: string } = {
      // For userspace, the driveId must be undefined.
      supportsAllDrives: true,
    };
    if (isSharedDrive) {
      opts = {
        driveId: driveId,
        supportsAllDrives: true,
      };
    }
    const startTokenRes = await driveClient.changes.getStartPageToken(opts);
    if (startTokenRes.status !== 200) {
      throw new Error(
        `Error getting start page token. status_code: ${startTokenRes.status}. status_text: ${startTokenRes.statusText}`
      );
    }
    if (!startTokenRes.data.startPageToken) {
      throw new Error("No start page token found");
    }
    lastSyncToken = startTokenRes.data.startPageToken;
  }

  return lastSyncToken;
}

export async function objectIsInFolderSelection(
  connectorId: ModelId,
  authCredentials: OAuth2Client,
  driveFile: GoogleDriveObjectType,
  foldersIds: string[],
  startSyncTs: number
): Promise<boolean> {
  if (foldersIds.includes(driveFile.id)) {
    return true;
  }

  const parents = await getFileParentsMemoized(
    connectorId,
    authCredentials,
    driveFile,
    startSyncTs
  );

  for (const parent of parents) {
    if (foldersIds.includes(parent)) {
      return true;
    }
  }

  return false;
}
