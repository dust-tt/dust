import type { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { getEnabledFeatureFlagsMemoized } from "@connectors/lib/workspace";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export const MIME_TYPES_TO_EXPORT: { [key: string]: string } = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
};

export async function getMimeTypesToDownload({
  pdfEnabled,
  connector,
}: {
  pdfEnabled: boolean;
  connector: ConnectorResource;
}) {
  const mimeTypes = [
    "text/plain",
    // docx files hosted on Gdrive
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Temporarily excluding pptx files for debugging purpose.
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  if (pdfEnabled) {
    mimeTypes.push("application/pdf");
  }
  const csvEnabled = await isCsvEnabled(connector);
  if (csvEnabled) {
    mimeTypes.push("text/csv");
  }

  return mimeTypes;
}

export async function getMimeTypesToSync({
  pdfEnabled,
  connector,
}: {
  pdfEnabled: boolean;
  connector: ConnectorResource;
}) {
  const mimeTypes = await getMimeTypesToDownload({
    pdfEnabled,
    connector,
  });
  mimeTypes.push(...Object.keys(MIME_TYPES_TO_EXPORT));
  mimeTypes.push("application/vnd.google-apps.folder");
  mimeTypes.push("application/vnd.google-apps.spreadsheet");

  return mimeTypes;
}

export function isGoogleDriveFolder(file: GoogleDriveFiles) {
  return file.mimeType === "application/vnd.google-apps.folder";
}

export function isGoogleDriveSpreadSheetFile(file: { mimeType: string }) {
  return file.mimeType === "application/vnd.google-apps.spreadsheet";
}

async function isCsvEnabled(connector: ConnectorResource): Promise<boolean> {
  const enabledFeatureFlags = await getEnabledFeatureFlagsMemoized(connector);
  return !!enabledFeatureFlags.includes("google_csv_sync");
}
