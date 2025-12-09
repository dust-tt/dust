import type { drive_v3 } from "googleapis";
import type { GaxiosResponse } from "googleapis-common";

import { getConnectorManager } from "@connectors/connectors";
import {
  fixParentsConsistency,
  getLocalParents,
  updateParentsField,
} from "@connectors/connectors/google_drive/lib";
import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import { markFolderAsVisited } from "@connectors/connectors/google_drive/temporal/activities";
import {
  launchGoogleDriveIncrementalSyncWorkflow,
  launchGoogleFixParentsConsistencyWorkflow,
} from "@connectors/connectors/google_drive/temporal/client";
import { syncOneFile } from "@connectors/connectors/google_drive/temporal/file";
import { MIME_TYPES_TO_EXPORT } from "@connectors/connectors/google_drive/temporal/mime_types";
import { getMimeTypesToSync } from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  _getLabels,
  getAuthObject,
  getDriveClient,
  getDriveFileId,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { throwOnError } from "@connectors/lib/cli";
import {
  GoogleDriveConfigModel,
  GoogleDriveFilesModel,
  GoogleDriveFoldersModel,
} from "@connectors/lib/models/google_drive";
import { terminateWorkflow } from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type {
  AdminSuccessResponseType,
  CheckFileGenericResponseType,
  GoogleDriveCommandType,
} from "@connectors/types";
import {
  FILE_ATTRIBUTES_TO_FETCH,
  googleDriveIncrementalSyncWorkflowId,
} from "@connectors/types";

const getConnector = async (args: GoogleDriveCommandType["args"]) => {
  if (!args.wId) {
    throw new Error("Missing --wId argument");
  }
  if (!args.dsId && !args.connectorId) {
    throw new Error("Missing --dsId or --connectorId argument");
  }

  // We retrieve by data source name as we can have multiple data source with the same provider for
  // a given workspace.
  const connector = await ConnectorModel.findOne({
    where: {
      workspaceId: `${args.wId}`,
      type: "google_drive",
      ...(args.dsId ? { dataSourceId: args.dsId } : {}),
      ...(args.connectorId ? { id: args.connectorId } : {}),
    },
  });

  if (!connector) {
    throw new Error("Could not find connector");
  }

  return connector;
};

export const google_drive = async ({
  command,
  args,
}: GoogleDriveCommandType): Promise<
  AdminSuccessResponseType | CheckFileGenericResponseType
> => {
  const logger = topLogger.child({
    majorCommand: "google_drive",
    command,
    args,
  });
  switch (command) {
    case "garbage-collect-all": {
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "google_drive",
        },
      });
      for (const connector of connectors) {
        if (!connector.pausedAt) {
          await throwOnError(
            getConnectorManager({
              connectorId: connector.id,
              connectorProvider: "google_drive",
            }).garbageCollect()
          );
        }
      }
      return { success: true };
    }
    case "list-labels": {
      const connector = await getConnector(args);
      const authCredentials = await getAuthObject(connector.connectionId);
      const labels = await _getLabels(connector.id, authCredentials);
      return { status: 200, content: labels, type: typeof labels };
    }
    case "check-file": {
      const connector = await getConnector(args);
      if (
        !args.fileType ||
        (args.fileType !== "document" && args.fileType !== "presentation")
      ) {
        throw new Error(
          `Invalid or missing --fileType argument: ${args.fileType}`
        );
      }
      logger.info("[Admin] Checking gdrive file");
      const drive = await getDriveClient(
        await getAuthObject(connector.connectionId)
      );
      const res = await drive.files.export({
        fileId: args.fileId,
        mimeType:
          MIME_TYPES_TO_EXPORT[
            args.fileType === "document"
              ? "application/vnd.google-apps.document"
              : "application/vnd.google-apps.presentation"
          ],
      });
      return { status: res.status, content: res.data, type: typeof res.data };
    }
    case "get-file-metadata": {
      const connector = await getConnector(args);
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }
      const fileId = args.fileId;
      const now = Date.now();
      const authCredentials = await getAuthObject(connector.connectionId);
      const driveObject = await getGoogleDriveObject({
        connectorId: connector.id,
        authCredentials,
        driveObjectId: getDriveFileId(fileId),
        cacheKey: { connectorId: connector.id, ts: now },
      });

      logger.info({ driveObject }, "driveObject");
      return { success: true };
    }
    case "upsert-file": {
      const connector = await getConnector(args);
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }
      const fileId = args.fileId;
      const now = Date.now();
      const authCredentials = await getAuthObject(connector.connectionId);
      const driveObject = await getGoogleDriveObject({
        connectorId: connector.id,
        authCredentials,
        driveObjectId: getDriveFileId(fileId),
        cacheKey: { connectorId: connector.id, ts: now },
      });
      if (!driveObject) {
        throw new Error(`Can't find google drive object: ${fileId}`);
      }

      const [, ...parents] = await getFileParentsMemoized(
        connector.id,
        authCredentials,
        driveObject,
        now
      );
      const reversedParents = parents.reverse();
      const dataSourceConfig = dataSourceConfigFromConnector(connector);

      // Upsert parents if missing
      for (const parent of reversedParents) {
        const file = await GoogleDriveFilesModel.findOne({
          where: {
            connectorId: connector.id,
            driveFileId: parent,
          },
        });
        if (!file) {
          const parentDriveObject = await getGoogleDriveObject({
            connectorId: connector.id,
            authCredentials,
            driveObjectId: getDriveFileId(parent),
            cacheKey: { connectorId: connector.id, ts: now },
          });
          if (!parentDriveObject) {
            throw new Error(`Can't find google drive object: ${parent}`);
          }

          await markFolderAsVisited(connector.id, parent, now);
        }
      }

      await syncOneFile(
        connector.id,
        authCredentials,
        dataSourceConfig,
        driveObject,
        now
      );

      return { success: true };
    }

    case "get-google-parents": {
      const connector = await getConnector(args);
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }
      const fileId = args.fileId;
      const now = Date.now();
      const authCredentials = await getAuthObject(connector.connectionId);
      const driveObject = await getGoogleDriveObject({
        connectorId: connector.id,
        authCredentials,
        driveObjectId: getDriveFileId(fileId),
        cacheKey: { connectorId: connector.id, ts: now },
      });
      if (!driveObject) {
        throw new Error("Can't find google drive object");
      }
      const parents = await getFileParentsMemoized(
        connector.id,
        authCredentials,
        driveObject,
        now
      );
      if (args.fix === "true") {
        const connectorResource = await ConnectorResource.fetchById(
          connector.id
        );
        if (!connectorResource) {
          throw new Error("Connector not found");
        }
        const existingFile = await GoogleDriveFilesModel.findOne({
          where: {
            driveFileId: getDriveFileId(fileId),
            connectorId: connector.id,
          },
        });
        if (!existingFile) {
          throw new Error("File not found");
        }
        await fixParentsConsistency({
          connector: connectorResource,
          files: [existingFile],
          startSyncTs: 0,
          logger,
          checkFromGoogle: true,
          execute: true,
        });
      }

      return { status: 200, content: parents, type: typeof parents };
    }

    case "clean-invalid-parents": {
      const execute = !!args.execute;
      const connector = await getConnector(args);
      await launchGoogleFixParentsConsistencyWorkflow(connector.id, execute);
      return { success: true };
    }

    case "update-core-parents": {
      const connector = await getConnector(args);
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }
      const file = await GoogleDriveFilesModel.findOne({
        where: {
          connectorId: connector.id,
          dustFileId: args.fileId,
        },
      });
      if (!file) {
        throw new Error(`File ${args.fileId} not found`);
      }
      const now = new Date().getTime();
      const localParents = await getLocalParents(
        connector.id,
        file.dustFileId,
        `${now}`
      );
      await updateParentsField(connector, file, localParents, logger);
      return { success: true };
    }

    case "start-incremental-sync": {
      const connector = await getConnector(args);
      await throwOnError(
        launchGoogleDriveIncrementalSyncWorkflow(connector.id)
      );
      return { success: true };
    }
    case "restart-all-incremental-sync-workflows": {
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "google_drive",
          errorType: null,
          pausedAt: null,
        },
      });
      for (const connector of connectors) {
        const workflowId = googleDriveIncrementalSyncWorkflowId(connector.id);
        await terminateWorkflow(workflowId);
        await throwOnError(
          launchGoogleDriveIncrementalSyncWorkflow(connector.id)
        );
      }
      return { success: true };
    }

    case "skip-file": {
      const connector = await getConnector(args);
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }

      const existingFile = await GoogleDriveFilesModel.findOne({
        where: {
          driveFileId: args.fileId,
          connectorId: connector.id,
        },
      });
      if (existingFile) {
        await existingFile.update({
          skipReason: args.reason || "blacklisted",
        });
      } else {
        await GoogleDriveFilesModel.create({
          driveFileId: args.fileId,
          dustFileId: getInternalId(args.fileId),
          name: "unknown",
          mimeType: "unknown",
          connectorId: connector.id,
          skipReason: args.reason || "blacklisted",
        });
      }

      return { success: true };
    }

    case "export-folder-structure": {
      const connector = await getConnector(args);
      const config = await GoogleDriveConfigModel.findOne({
        where: {
          connectorId: connector.id,
        },
      });

      const mimeTypesToSync = getMimeTypesToSync({
        pdfEnabled: config?.pdfEnabled || false,
        csvEnabled: config?.csvEnabled || false,
      });

      const authCredentials = await getAuthObject(connector.connectionId);
      const drive = await getDriveClient(authCredentials);

      // Get all folders configured to sync
      const foldersToSync = await GoogleDriveFoldersModel.findAll({
        where: {
          connectorId: connector.id,
        },
      });

      interface FolderNode {
        id: string;
        name: string;
        path: string;
        children: FolderNode[];
        fileCount: number;
        lastSeenTs: Date | null;
      }

      const folderStructure: FolderNode[] = [];
      let totalFileCount = 0;
      const visitedFolders = new Set<string>();

      const buildFolderTree = async (
        folderId: string,
        parentPath: string = ""
      ): Promise<FolderNode> => {
        if (visitedFolders.has(folderId)) {
          // Return empty structure for already visited folders to avoid cycles
          return {
            id: folderId,
            name: "circular reference",
            path: parentPath,
            children: [],
            fileCount: 0,
            lastSeenTs: null,
          };
        }
        visitedFolders.add(folderId);

        // Get folder info
        const folderObject = await getGoogleDriveObject({
          connectorId: connector.id,
          authCredentials,
          driveObjectId: folderId,
          cacheKey: { connectorId: connector.id, ts: Date.now() },
        });

        // Get lastSeenTs from database if it exists
        const folderFile = await GoogleDriveFilesModel.findOne({
          where: {
            connectorId: connector.id,
            driveFileId: folderId,
          },
        });

        if (!folderObject) {
          return {
            id: folderId,
            name: "not found",
            path: parentPath,
            children: [],
            fileCount: 0,
            lastSeenTs: folderFile?.lastSeenTs || null,
          };
        }

        const folderName = folderObject.name;
        const currentPath = parentPath
          ? `${parentPath}/${folderName}`
          : folderName;

        const node: FolderNode = {
          id: folderId,
          name: folderName,
          path: currentPath,
          children: [],
          fileCount: 0,
          lastSeenTs: folderFile?.lastSeenTs || null,
        };

        // Build mime type query
        const mimeTypesSearchString = mimeTypesToSync
          .map((mimeType) => `mimeType='${mimeType}'`)
          .join(" or ");

        // List all files and folders in this folder
        let nextPageToken: string | undefined = undefined;
        do {
          const res: GaxiosResponse<drive_v3.Schema$FileList> =
            await drive.files.list({
              corpora: "allDrives",
              pageSize: 200,
              includeItemsFromAllDrives: true,
              supportsAllDrives: true,
              fields: `nextPageToken, files(${FILE_ATTRIBUTES_TO_FETCH.join(",")})`,
              q: `'${folderId}' in parents and (${mimeTypesSearchString}) and trashed=false`,
              ...(nextPageToken ? { pageToken: nextPageToken } : {}),
            });

          if (res.status !== 200 || !res.data.files) {
            logger.warn(
              { folderId, status: res.status },
              "Error listing files in folder"
            );
            break;
          }

          for (const file of res.data.files) {
            if (!file.id || !file.name || !file.mimeType) {
              continue;
            }

            if (file.mimeType === "application/vnd.google-apps.folder") {
              // Recursively process subfolder
              const childNode = await buildFolderTree(file.id, currentPath);
              node.children.push(childNode);
              node.fileCount += childNode.fileCount;
            } else {
              // Count file (but don't include in structure)
              node.fileCount++;
              totalFileCount++;
            }
          }

          nextPageToken = res.data.nextPageToken || undefined;
        } while (nextPageToken);

        return node;
      };

      // Build tree for each root folder
      for (const folder of foldersToSync) {
        const rootNode = await buildFolderTree(folder.folderId);
        folderStructure.push(rootNode);
      }

      return {
        status: 200,
        content: {
          totalFileCount,
          folderStructure,
        },
        type: typeof folderStructure,
      };
    }

    default:
      throw new Error("Unknown google command: " + command);
  }
};
