import type { GoogleDriveFiles } from "@connectors/lib/models/google_drive";

export const MIME_TYPES_TO_EXPORT: { [key: string]: string } = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
};

export function getMimeTypesToDownload({
  pdfEnabled,
}: {
  pdfEnabled: boolean;
}) {
  const mimeTypes = ["text/plain"];
  if (pdfEnabled) {
    mimeTypes.push("application/pdf");
  }

  return mimeTypes;
}

export function getMimeTypesToSync({ pdfEnabled }: { pdfEnabled: boolean }) {
  const mimeTypes = getMimeTypesToDownload({
    pdfEnabled,
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
