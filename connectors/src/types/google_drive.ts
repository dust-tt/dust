export type GoogleDriveObjectType = {
  capabilities: {
    canDownload: boolean;
  };
  createdAtMs: number;
  id: string;
  lastEditor?: {
    displayName: string;
  };
  mimeType: string;
  name: string;
  parent: string | null;
  size: number | null;
  trashed: boolean;
  updatedAtMs?: number;
  webViewLink?: string;
  driveId: string;
  isInSharedDrive: boolean;
  labels: string[];
};

export const FILE_ATTRIBUTES_TO_FETCH = [
  "capabilities",
  "createdTime",
  "driveId",
  "id",
  "lastModifyingUser",
  "mimeType",
  "modifiedTime",
  "name",
  "parents",
  "size",
  "trashed",
  "webViewLink",
  "labelInfo",
] as const;

// Get the Table ID for a sheet within a Google Spreadsheet from the

import type { ModelId } from "@connectors/types";

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
  if (!parts[0] || !parts[1]) {
    throw new Error("Invalid internal ID");
  }
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
