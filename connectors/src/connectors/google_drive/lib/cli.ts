import type {
  AdminSuccessResponseType,
  CheckFileGenericResponseType,
  GoogleDriveCommandType,
} from "@dust-tt/types";
import { googleDriveIncrementalSyncWorkflowId } from "@dust-tt/types";

import { getConnectorManager } from "@connectors/connectors";
import {
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
import {
  _getLabels,
  getAuthObject,
  getDriveClient,
  getDriveFileId,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { throwOnError } from "@connectors/lib/cli";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { terminateWorkflow } from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

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
        await throwOnError(
          getConnectorManager({
            connectorId: connector.id,
            connectorProvider: "google_drive",
          }).garbageCollect()
        );
      }
      return { success: true };
    }
    case "list-labels": {
      const connector = await getConnector(args);
      const authCredentials = await getAuthObject(connector.connectionId);
      const labels = await _getLabels(authCredentials);
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
    case "upsert-file": {
      const connector = await getConnector(args);
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }
      const fileId = args.fileId;
      const now = Date.now();
      const authCredentials = await getAuthObject(connector.connectionId);
      const driveObject = await getGoogleDriveObject({
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
        const file = await GoogleDriveFiles.findOne({
          where: {
            connectorId: connector.id,
            driveFileId: parent,
          },
        });
        if (!file) {
          const parentDriveObject = await getGoogleDriveObject({
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
      const file = await GoogleDriveFiles.findOne({
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

      const existingFile = await GoogleDriveFiles.findOne({
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
        await GoogleDriveFiles.create({
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

    default:
      throw new Error("Unknown google command: " + command);
  }
};
