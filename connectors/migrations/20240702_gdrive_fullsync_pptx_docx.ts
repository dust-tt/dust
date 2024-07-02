import { launchGoogleDriveFullSyncWorkflow } from "@connectors/connectors/google_drive/temporal/client";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const { LIVE } = process.env;

// Syncing all pptx and docx files for all existing Google Drive connectors.
export async function main() {
  const connectors = await ConnectorModel.findAll({
    where: {
      type: "google_drive",
      errorType: null,
      pausedAt: null,
    },
  });
  const mimeTypeFilter = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.google-apps.folder",
  ];

  for (const connector of connectors) {
    try {
      if (LIVE) {
        await launchGoogleDriveFullSyncWorkflow(
          connector.id,
          null,
          mimeTypeFilter
        );
      }
    } catch (e) {
      logger.error(
        { connectorId: connector.id, error: e },
        "Failed to launch workflow - skipping"
      );
    }
  }
}

main().catch(console.error);
