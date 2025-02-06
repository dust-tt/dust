import type { ContentNodesViewType, ModelId } from "@dust-tt/types";
import {
  cacheWithRedis,
  getGoogleIdsFromSheetContentNodeInternalId,
  isGoogleSheetContentNodeInternalId,
  removeNulls,
} from "@dust-tt/types";
import type { Logger } from "pino";
import type { InferAttributes, WhereOptions } from "sequelize";

import { isGoogleDriveSpreadSheetFile } from "@connectors/connectors/google_drive/temporal/mime_types";
import { deleteSpreadsheet } from "@connectors/connectors/google_drive/temporal/spreadsheets";
import {
  getDriveFileId,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { sequelizeConnection } from "@connectors/resources/storage";

export async function isDriveObjectExpandable({
  objectId,
  mimeType,
  connectorId,
  viewType,
}: {
  objectId: string;
  mimeType: string;
  connectorId: ModelId;
  viewType: ContentNodesViewType;
}): Promise<boolean> {
  if (isGoogleDriveSpreadSheetFile({ mimeType }) && viewType === "tables") {
    // In tables view, Spreadsheets can be expanded to show their sheets.
    return !!(await GoogleDriveSheet.findOne({
      attributes: ["id"],
      where: {
        driveFileId: objectId,
        connectorId: connectorId,
      },
    }));
  }

  const where: WhereOptions<InferAttributes<GoogleDriveFiles>> = {
    connectorId: connectorId,
    parentId: objectId,
  };

  return !!(await GoogleDriveFiles.findOne({
    attributes: ["id"],
    where,
  }));
}

async function _getLocalParents(
  connectorId: ModelId,
  contentNodeInternalId: string,
  memoizationKey: string
): Promise<string[]> {
  let parentId: string | null = null;

  if (isGoogleSheetContentNodeInternalId(contentNodeInternalId)) {
    // For a Google Sheet, the parent ID is the ContentNodeInternalId
    // of the Google Spreadsheet that contains the sheet.
    const { googleFileId } = getGoogleIdsFromSheetContentNodeInternalId(
      contentNodeInternalId
    );
    parentId = getInternalId(googleFileId);
  } else {
    const object = await GoogleDriveFiles.findOne({
      where: {
        connectorId,
        driveFileId: getDriveFileId(contentNodeInternalId),
      },
    });
    if (!object) {
      // edge case: If the object is not in our database, it has no local
      // parents.
      return [];
    }
    parentId = object.parentId ? getInternalId(object.parentId) : null;
  }

  const parents: string[] = [contentNodeInternalId];

  if (!parentId) {
    return parents;
  }

  return parents.concat(
    await getLocalParents(connectorId, parentId, memoizationKey)
  );
}

export const getLocalParents = cacheWithRedis(
  _getLocalParents,
  (connectorId, contentNodeInternalId, memoizationKey) => {
    return `${connectorId}:${contentNodeInternalId}:${memoizationKey}`;
  },
  60 * 10 * 1000
);

export async function internalDeleteFile(
  connector: ConnectorResource,
  googleDriveFile: GoogleDriveFiles
) {
  if (isGoogleDriveSpreadSheetFile(googleDriveFile)) {
    await deleteSpreadsheet(connector, googleDriveFile);
  } else if (
    googleDriveFile.mimeType !== "application/vnd.google-apps.folder"
  ) {
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    await deleteDataSourceDocument(
      dataSourceConfig,
      googleDriveFile.dustFileId
    );
  }
  const folder = await GoogleDriveFolders.findOne({
    where: {
      connectorId: connector.id,
      folderId: googleDriveFile.driveFileId,
    },
  });

  await sequelizeConnection.transaction(async (t) => {
    if (folder) {
      await folder.destroy({ transaction: t });
    }
    await googleDriveFile.destroy({ transaction: t });
  });

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: googleDriveFile.dustFileId,
  });
}

export async function fixParents(
  connector: ConnectorResource,
  files: GoogleDriveFiles[],
  logger: Logger,
  execute: boolean = true
) {
  const parentFiles = await GoogleDriveFiles.findAll({
    where: {
      connectorId: connector.id,
      driveFileId: [...new Set(removeNulls(files.map((f) => f.parentId)))],
    },
  });

  const roots = await GoogleDriveFolders.findAll({
    where: {
      connectorId: connector.id,
    },
  });

  for (const file of files) {
    if (file.parentId) {
      const parentFile = parentFiles.find(
        (f) => f.driveFileId === file.parentId
      );
      if (!parentFile) {
        if (roots.find((r) => r.folderId === file.driveFileId)) {
          logger.info(
            { fileId: file.driveFileId },
            "Invalid parent but root folder, resetting parent in connector to match core"
          );
          if (execute) {
            await file.update({
              parentId: null,
            });
          }
        } else {
          logger.info(
            { fileId: file.driveFileId },
            "Deleting file with invalid parents"
          );
          if (execute) {
            await internalDeleteFile(connector, file);
          }
        }
      }
    }
  }
}
