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
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES, stripNullBytes } from "@connectors/types";

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
    logger.info(
      { driveFileId },
      `Google Drive File unexpectedly not found (got 404)`
    );
    // We got a 404 on this folder, we skip it.
    return;
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const parentGoogleIds = await getFileParentsMemoized(
    connectorId,
    authCredentials,
    file,
    startSyncTs
  );

  const parents = parentGoogleIds.map((parent) => getInternalId(parent));
  const name = stripNullBytes(file.name) ?? "";

  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: getInternalId(file.id),
    parents,
    parentId: parents[1] || null,
    title: name,
    mimeType: INTERNAL_MIME_TYPES.GOOGLE_DRIVE.FOLDER,
    sourceUrl: getSourceUrlForGoogleDriveFiles(file),
  });

  await GoogleDriveFiles.upsert({
    connectorId: connectorId,
    dustFileId: getInternalId(driveFileId),
    driveFileId: file.id,
    name,
    mimeType: file.mimeType,
    parentId: parents[1] ? getDriveFileId(parents[1]) : null,
    lastSeenTs: new Date(),
  });
}
