import { removeNulls } from "@dust-tt/client";
import type { Logger } from "pino";
import type { InferAttributes, WhereOptions } from "sequelize";

import { getSourceUrlForGoogleDriveFiles } from "@connectors/connectors/google_drive";
import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  isGoogleDriveFolder,
  isGoogleDriveSpreadSheetFile,
} from "@connectors/connectors/google_drive/temporal/mime_types";
import { deleteSpreadsheet } from "@connectors/connectors/google_drive/temporal/spreadsheets";
import {
  getAuthObject,
  getDriveFileId,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
  updateDataSourceDocumentParents,
  updateDataSourceTableParents,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  GoogleDriveFiles,
  GoogleDriveFolders,
  GoogleDriveSheet,
} from "@connectors/lib/models/google_drive";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { ContentNodesViewType } from "@connectors/types";
import type { ModelId } from "@connectors/types";
import {
  cacheWithRedis,
  concurrentExecutor,
  getGoogleIdsFromSheetContentNodeInternalId,
  getGoogleSheetTableId,
  INTERNAL_MIME_TYPES,
  isGoogleSheetContentNodeInternalId,
} from "@connectors/types";
import { withTransaction } from "@connectors/types/shared/utils/sql_utils";

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
  if (isGoogleDriveSpreadSheetFile({ mimeType }) && viewType === "table") {
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
  {
    ttlMs: 60 * 10 * 1000,
  }
);

export async function internalDeleteFile(
  connector: ConnectorResource,
  googleDriveFile: GoogleDriveFiles
) {
  if (isGoogleDriveSpreadSheetFile(googleDriveFile)) {
    await deleteSpreadsheet(connector, googleDriveFile);
  } else if (isGoogleDriveFolder(googleDriveFile)) {
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: googleDriveFile.dustFileId,
    });
  } else {
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

  await withTransaction(async (t) => {
    if (folder) {
      await folder.destroy({ transaction: t });
    }
    await googleDriveFile.destroy({ transaction: t });
  });
}

export async function updateParentsField(
  connector: ConnectorResource | ConnectorModel,
  file: GoogleDriveFiles,
  parentIds: string[],
  logger: Logger
) {
  await file.update({
    parentId: parentIds[1] ? getDriveFileId(parentIds[1]) : null,
  });
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  logger.info({ file: file.dustFileId, parentIds }, "Updating parents");

  if (isGoogleDriveFolder(file) || isGoogleDriveSpreadSheetFile(file)) {
    await upsertDataSourceFolder({
      dataSourceConfig,
      folderId: file.dustFileId,
      parents: parentIds,
      parentId: parentIds[1] ?? null,
      title: file.name ?? "",
      mimeType: INTERNAL_MIME_TYPES.GOOGLE_DRIVE.FOLDER,
      sourceUrl: getSourceUrlForGoogleDriveFiles(file),
    });
    const sheets = await GoogleDriveSheet.findAll({
      where: {
        driveFileId: file.driveFileId,
        connectorId: connector.id,
        notUpsertedReason: null,
      },
    });
    for (const sheet of sheets) {
      const tableId = getGoogleSheetTableId(
        sheet.driveFileId,
        sheet.driveSheetId
      );
      await updateDataSourceTableParents({
        dataSourceConfig,
        tableId,
        parents: [tableId, ...parentIds],
        parentId: file.dustFileId,
      });
    }
  } else {
    await updateDataSourceDocumentParents({
      dataSourceConfig,
      documentId: file.dustFileId,
      parents: parentIds,
      parentId: parentIds[1] ?? null,
    });
  }
}

/**
 * Fixes parent-child relationship consistency for Google Drive files.
 *
 * This function performs two main checks:
 * 1. If checkFromGoogle=true, verifies that local parent relationships match Google Drive
 * 2. Validates that all parent IDs reference valid files or root folders
 *
 * For any inconsistencies found:
 * - If execute=false, only logs the issues
 * - If execute=true, fixes the inconsistencies by:
 *   - Deleting files that don't exist in Google Drive
 *   - Updating parent relationships to match Google Drive
 *   - Deleting files with invalid parents
 *   - Resetting parent to null for root folders
 *
 * @param connector - The Google Drive connector resource
 * @param files - List of GoogleDriveFiles to check
 * @param startSyncTs - Timestamp for caching/memoization
 * @param checkFromGoogle - Whether to verify against Google Drive API
 * @param execute - Whether to fix inconsistencies or just log them
 * @param logger - Logger instance for recording issues
 */
export async function fixParentsConsistency({
  connector,
  files,
  startSyncTs,
  checkFromGoogle = false,
  execute = false,
  logger,
}: {
  connector: ConnectorResource;
  files: GoogleDriveFiles[];
  startSyncTs: number;
  checkFromGoogle?: boolean;
  execute?: boolean;
  logger: Logger;
}) {
  // First check consistency with Google Drive
  if (checkFromGoogle) {
    logger.info("Checking consistency with Google Drive");
    const authCredentials = await getAuthObject(connector.connectionId);
    const dataSourceConfig = dataSourceConfigFromConnector(connector);

    const googleFiles = removeNulls(
      await concurrentExecutor(
        files,
        async (file) =>
          getGoogleDriveObject({
            connectorId: connector.id,
            authCredentials,
            driveObjectId: file.driveFileId,
            cacheKey: {
              connectorId: connector.id,
              ts: startSyncTs,
            },
          }),
        {
          concurrency: 100,
        }
      )
    );

    for (const file of files) {
      const googleFile = googleFiles.find((f) => f.id === file.driveFileId);
      if (!googleFile) {
        logger.info(
          { dustFileId: file.dustFileId },
          "File does not exist in Google Drive, deleting"
        );
        if (execute) {
          await internalDeleteFile(connector, file);
        }
      } else {
        const parents = await getFileParentsMemoized(
          connector.id,
          authCredentials,
          googleFile,
          startSyncTs
        );
        const googleParents = parents.map((p) => getInternalId(p));
        const localParents = await getLocalParents(
          connector.id,
          file.dustFileId,
          `${startSyncTs}`
        );
        if (parents[parents.length - 1] === "gdrive_outside_sync") {
          logger.info(
            { dustFileId: file.dustFileId },
            "File is outside of sync, deleting"
          );
          if (execute) {
            await internalDeleteFile(connector, file);
          }
        } else if (
          JSON.stringify(googleParents) !== JSON.stringify(localParents)
        ) {
          logger.info(
            {
              localParents,
              googleParents,
              dustFileId: file.dustFileId,
            },
            "Parents not consistent with gdrive, updating"
          );

          // Get all parents to check existence
          const existingParents = await GoogleDriveFiles.findAll({
            where: {
              connectorId: connector.id,
              dustFileId: googleParents,
            },
          });
          const missing = googleParents.filter(
            (id) => !existingParents.find((f) => f.dustFileId === id)
          );

          logger.info({ missing: missing }, "Missing folders, restoring");
          if (execute) {
            for (const missingFolderId of missing) {
              const missingFolder = await getGoogleDriveObject({
                connectorId: connector.id,
                authCredentials,
                driveObjectId: getDriveFileId(missingFolderId),
              });

              if (missingFolder) {
                const missingFolderParents = (
                  await getFileParentsMemoized(
                    connector.id,
                    authCredentials,
                    missingFolder,
                    startSyncTs
                  )
                ).map((p) => getInternalId(p));
                await upsertDataSourceFolder({
                  dataSourceConfig,
                  folderId: missingFolderId,
                  parents: missingFolderParents,
                  parentId: missingFolderParents[1] || null,
                  title: missingFolder.name ?? "",
                  mimeType: INTERNAL_MIME_TYPES.GOOGLE_DRIVE.FOLDER,
                  sourceUrl: getSourceUrlForGoogleDriveFiles(missingFolder),
                });

                await GoogleDriveFiles.upsert({
                  connectorId: connector.id,
                  dustFileId: missingFolderId,
                  driveFileId: getDriveFileId(missingFolderId),
                  name: missingFolder.name,
                  mimeType: missingFolder.mimeType,
                  parentId: missingFolderParents[1]
                    ? getDriveFileId(missingFolderParents[1])
                    : null,
                  lastSeenTs: new Date(),
                });
              }
            }
          }
          if (execute) {
            await updateParentsField(connector, file, googleParents, logger);
          }
        }
      }
    }

    // Re-fetch files to ensure we only process non-deleted ones
    files = await GoogleDriveFiles.findAll({
      where: {
        id: files.map((f) => f.id),
      },
    });
  }

  logger.info("Checking parentIds validity");

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
    if (!file.parentId && !roots.find((r) => r.folderId === file.driveFileId)) {
      logger.info(
        { fileId: file.driveFileId },
        "Deleting file with no parent and not a root folder"
      );
      if (execute) {
        await internalDeleteFile(connector, file);
      }
    }
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
