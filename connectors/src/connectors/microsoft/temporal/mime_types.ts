export function getMimeTypesToSync({ pdfEnabled }: { pdfEnabled: boolean }) {
  const mimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // TODO(pr): support those
    // "text/plain",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel", // Microsoft type for "text/csv"
  ];
  if (pdfEnabled) {
    mimeTypes.push("application/pdf");
  }

  return mimeTypes;
}
