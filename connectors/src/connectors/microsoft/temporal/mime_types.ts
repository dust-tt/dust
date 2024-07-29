export async function getMimeTypesToSync({
  pdfEnabled,
  csvEnabled,
}: {
  pdfEnabled: boolean;
  csvEnabled: boolean;
}) {
  const mimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  if (pdfEnabled) {
    mimeTypes.push("application/pdf");
  }
  if (csvEnabled) {
    mimeTypes.push("application/vnd.ms-excel"); // Microsoft type for "text/csv"
    mimeTypes.push("text/csv");
  }

  return mimeTypes;
}
