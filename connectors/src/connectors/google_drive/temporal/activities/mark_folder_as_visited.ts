import { getSourceUrlForGoogleDriveFiles } from "@connectors/connectors/google_drive";
import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  getAuthObject,
  getDriveFileId,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { GoogleDriveFilesModel } from "@connectors/lib/models/google_drive";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GoogleDriveObjectType, ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES, stripNullBytes } from "@connectors/types";
import type { OAuth2Client } from "googleapis-common";
import type { CreationAttributes } from "sequelize";

export async function upsertGoogleDriveFolderMetadata({
  connector,
  authCredentials,
  file,
  startSyncTs,
  updateLastSeenTs = false,
  upsertDataSourceFolderForSkipped = false,
}: {
  connector: ConnectorResource;
  authCredentials: OAuth2Client;
  file: GoogleDriveObjectType;
  startSyncTs: number;
  updateLastSeenTs?: boolean;
  upsertDataSourceFolderForSkipped?: boolean;
}) {
  const parentGoogleIds = await getFileParentsMemoized(
    connector.id,
    authCredentials,
    file,
    startSyncTs
  );

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const parents = parentGoogleIds.map((parent) => getInternalId(parent));
  const name = stripNullBytes(file.name) ?? "";

  const existingFolder = await GoogleDriveFilesModel.findOne({
    where: {
      connectorId: connector.id,
      driveFileId: file.id,
    },
  });

  if (!existingFolder?.skipReason || upsertDataSourceFolderForSkipped) {
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: getInternalId(file.id),
      parents,
      parentId: parents[1] || null,
      title: name,
      mimeType: INTERNAL_MIME_TYPES.GOOGLE_DRIVE.FOLDER,
      sourceUrl: getSourceUrlForGoogleDriveFiles(file),
    });
  }

  const googleDriveFileParams: CreationAttributes<GoogleDriveFilesModel> = {
    connectorId: connector.id,
    dustFileId: getInternalId(file.id),
    driveFileId: file.id,
    name,
    mimeType: file.mimeType,
    parentId: parents[1] ? getDriveFileId(parents[1]) : null,
  };

  if (updateLastSeenTs) {
    googleDriveFileParams.lastSeenTs = new Date();
  }

  await GoogleDriveFilesModel.upsert(googleDriveFileParams);
}

export async function markFolderAsVisited(
  connectorId: ModelId,
  driveFileId: string,
  startSyncTs: number = 0
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const authCredentials = await getAuthObject(connector.connectionId);
  const file = await getGoogleDriveObject({
    connectorId,
    authCredentials,
    driveObjectId: driveFileId,
    cacheKey: { connectorId, ts: startSyncTs },
  });

  if (!file) {
    getActivityLogger(connector).info(
      { driveFileId },
      `Google Drive File unexpectedly not found (got 404)`
    );
    // We got a 404 on this folder, we skip it.
    return;
  }

  await upsertGoogleDriveFolderMetadata({
    connector,
    authCredentials,
    file,
    startSyncTs,
    updateLastSeenTs: true,
    upsertDataSourceFolderForSkipped: true,
  });
}
