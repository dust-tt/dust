// Get the Table ID for a sheet within a Google Spreadsheet from the

import { ModelId } from "../shared/model_id";

// Google-provided file ID and the ID of the sheet within the spreadsheet.
export function getGoogleSheetTableId(
  googleFileId: string,
  googleSheetId: number
): string {
  return `google-spreadsheet-${googleFileId}-sheet-${googleSheetId}`;
}

// Get the Content Node ID for a sheet within a Google Spreadsheet from the
// Google-provided file ID and the ID of the sheet within the spreadsheet.
export function getGoogleSheetContentNodeInternalId(
  googleFileId: string,
  googleSheetId: number
): string {
  return getGoogleSheetTableId(googleFileId, googleSheetId);
}

// Recover the Google-provided file ID and the ID of the sheet within the
// spreadsheet from the Content Node ID of a sheet.
export function getGoogleIdsFromSheetContentNodeInternalId(
  internalId: string
): {
  googleFileId: string;
  googleSheetId: string;
} {
  const parts = internalId.split("-sheet-");
  const googleFileId = parts[0].replace("google-spreadsheet-", "");
  const googleSheetId = parts[1];
  return { googleFileId, googleSheetId };
}

// Check if a Content Node ID is a valid Content Node ID for a sheet within a
// Google Spreadsheet.
export function isGoogleSheetContentNodeInternalId(
  internalId: string
): boolean {
  return (
    internalId.startsWith("google-spreadsheet-") &&
    internalId.includes("-sheet-")
  );
}

export function googleDriveIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `googleDrive-IncrementalSync-${connectorId}`;
}
