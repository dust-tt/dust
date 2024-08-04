import type {
  AdminSuccessResponseType,
  CustomDataResponseType,
  GoogleDriveCommandType,
} from "@dust-tt/types";
import { googleDriveIncrementalSyncWorkflowId } from "@dust-tt/types";

import { getConnectorManager } from "@connectors/connectors";
import { launchGoogleDriveIncrementalSyncWorkflow } from "@connectors/connectors/google_drive/temporal/client";
import { MIME_TYPES_TO_EXPORT } from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  getAuthObject,
  getDocumentId,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import { throwOnError } from "@connectors/lib/cli";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { terminateWorkflow } from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

export const google_drive = async ({
  command,
  args,
}: GoogleDriveCommandType): Promise<
  AdminSuccessResponseType | CustomDataResponseType
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
    case "check-file": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }
      if (
        !args.fileType ||
        (args.fileType !== "document" && args.fileType !== "presentation")
      ) {
        throw new Error(
          `Invalid or missing --fileType argument: ${args.fileType}`
        );
      }
      logger.info("[Admin] Checking gdrive file");
      const connector = await ConnectorResource.fetchById(args.connectorId);
      if (!connector) {
        throw new Error(`Connector ${args.connectorId} not found`);
      }
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

    case "start-incremental-sync": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dataSourceName) {
        throw new Error("Missing --dataSourceName argument");
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          dataSourceName: args.dataSourceName,
          type: "google_drive",
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId} and data source ${args.dataSourceName}`
        );
      }
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
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dataSourceName) {
        throw new Error("Missing --dataSourceName argument");
      }
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          dataSourceName: args.dataSourceName,
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId} and data source ${args.dataSourceName}`
        );
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
          dustFileId: getDocumentId(args.fileId),
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
