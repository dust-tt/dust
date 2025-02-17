import { makeScript } from "scripts/helpers";

import { getGoogleDriveObject } from "@connectors/connectors/google_drive/lib/google_drive_api";
import { syncSpreadSheet } from "@connectors/connectors/google_drive/temporal/spreadsheets";
import { getAuthObject } from "@connectors/connectors/google_drive/temporal/utils";
import { ConnectorResource } from "@connectors/resources/connector_resource";

makeScript(
  {
    connectorId: { type: "number" },
    spreadsheetId: { type: "string" },
  },
  async ({ connectorId, spreadsheetId }) => {
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error("Connector not found.");
    }
    const authCredentials = await getAuthObject(connector.connectionId);

    // Fetch spreadsheet metadata.
    const spreadsheetData = await getGoogleDriveObject({
      authCredentials,
      driveObjectId: spreadsheetId,
    });
    if (!spreadsheetData) {
      throw new Error("Spreadsheet not found");
    }

    // Sync spreadsheet and its sheets.
    const result = await syncSpreadSheet(
      authCredentials,
      connectorId,
      spreadsheetData,
      new Date().getTime()
    );

    if (!result.isSupported) {
      throw new Error("Spreadsheet sync not supported");
    }

    if (result.skipReason) {
      throw new Error(`Spreadsheet sync skipped: ${result.skipReason}`);
    }
  }
);
