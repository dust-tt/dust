import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { extractGoogleDriveFileId } from "@app/lib/providers/google_drive/file_id";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";

export const googleDriveSyncFilePlugin = createPlugin({
  manifest: {
    id: "google-drive-sync-file",
    name: "Sync Google Drive File",
    description:
      "Force sync a single Google Drive file by its file ID. This will upsert the file and all its parent folders if needed.",
    resourceTypes: ["data_sources"],
    args: {
      fileId: {
        type: "string",
        label: "File ID",
        description:
          "Google Drive file ID (e.g., 1a2b3c4d5e6f7g8h9i0j or the full URL)",
      },
    },
    requiredRoles: ["support"],
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.connectorProvider === "google_drive";
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const { fileId } = args;
    if (!fileId.trim()) {
      return new Err(new Error("fileId is required"));
    }

    const extractedFileId = extractGoogleDriveFileId(fileId);
    if (!extractedFileId) {
      return new Err(
        new Error(
          "Invalid Google Drive file ID or URL. Please provide a valid file ID or URL."
        )
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const workspace = auth.getNonNullableWorkspace();

    const res = await connectorsAPI.admin({
      majorCommand: "google_drive",
      command: "upsert-file",
      args: {
        wId: workspace.sId,
        connectorId: connectorId.toString(),
        fileId: extractedFileId,
      },
    });

    if (res.isErr()) {
      return new Err(new Error(`Failed to sync file: ${res.error.message}`));
    }

    return new Ok({
      display: "text",
      value: `Successfully synced Google Drive file: ${extractedFileId}`,
    });
  },
});
