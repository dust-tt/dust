export const MIME_TYPES_TO_EXPORT: { [key: string]: string } = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
};

export function getMimeTypesToDownload({
  pdfEnabled,
  csvEnabled,
}: {
  pdfEnabled: boolean;
  csvEnabled: boolean;
}) {
  const mimeTypes = [
    "text/plain",
    "text/markdown",
    // docx files hosted on Gdrive
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // Temporarily excluding pptx files for debugging purpose.
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  if (pdfEnabled) {
    mimeTypes.push("application/pdf");
  }
  if (csvEnabled) {
    mimeTypes.push("text/csv");
  }

  return mimeTypes;
}

export function getMimeTypesToSync({
  pdfEnabled,
  csvEnabled,
}: {
  pdfEnabled: boolean;
  csvEnabled: boolean;
}) {
  const mimeTypes = getMimeTypesToDownload({
    pdfEnabled,
    csvEnabled,
  });
  mimeTypes.push(...Object.keys(MIME_TYPES_TO_EXPORT));
  mimeTypes.push("application/vnd.google-apps.folder");
  mimeTypes.push("application/vnd.google-apps.spreadsheet");

  return mimeTypes;
}

export function isGoogleDriveFolder(file: { mimeType: string }) {
  return file.mimeType === "application/vnd.google-apps.folder";
}

export function isGoogleDriveSpreadSheetFile(file: { mimeType: string }) {
  return file.mimeType === "application/vnd.google-apps.spreadsheet";
}

export function isTableFile(file: { mimeType: string }) {
  return (
    file.mimeType === "application/vnd.google-apps.spreadsheet" ||
    file.mimeType === "text/csv"
  );
}
