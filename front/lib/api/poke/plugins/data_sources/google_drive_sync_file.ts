import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import { ConnectorsAPI, Err, Ok } from "@app/types";

function extractGoogleDriveFileId(input: string): string | null {
  const trimmedInput = input.trim();

  // If it's already a file ID (alphanumeric, hyphens, underscores), return it
  if (/^[a-zA-Z0-9_-]+$/.test(trimmedInput)) {
    return trimmedInput;
  }

  try {
    const url = new URL(trimmedInput);

    // Handle docs.google.com URLs: /document/d/FILE_ID/, /spreadsheets/d/FILE_ID/, /presentation/d/FILE_ID/
    const docsMatch = url.pathname.match(
      /^\/(document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]+)/
    );
    if (docsMatch) {
      return docsMatch[2];
    }

    // Handle drive.google.com URLs: /file/d/FILE_ID/, /open?id=FILE_ID
    const driveMatch = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      return driveMatch[1];
    }

    // Handle drive.google.com/open?id=FILE_ID
    const idParam = url.searchParams.get("id");
    if (idParam) {
      return idParam;
    }

    return null;
  } catch {
    // If URL parsing fails, it's not a valid URL
    return null;
  }
}

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
