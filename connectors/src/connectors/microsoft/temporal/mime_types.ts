export function getMimeTypesToSync({ pdfEnabled }: { pdfEnabled: boolean }) {
  const mimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // TODO(pr): support those
    // "text/plain",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];
  if (pdfEnabled) {
    // TODO(pr): support it
    // mimeTypes.push("application/pdf");
  }

  return mimeTypes;
}
