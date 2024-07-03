export function getMimeTypesToSync({ pdfEnabled }: { pdfEnabled: boolean }) {
  const mimeTypes = [
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  if (pdfEnabled) {
    mimeTypes.push("application/pdf");
  }

  return mimeTypes;
}
