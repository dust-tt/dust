export class InvalidExtensionForMimeTypeError extends Error {
  constructor(
    extension: string,
    mimeType: string,
    supportedExtensions: string[]
  ) {
    super(
      `Invalid extension: ${extension} for MIME type: ${mimeType}. Supported extensions: ${supportedExtensions.join(
        ", "
      )}`
    );
  }
}
