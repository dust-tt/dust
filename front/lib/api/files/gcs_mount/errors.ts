export class GCSMountDirectoryAlreadyExistsError extends Error {
  constructor() {
    super("Folder already exists.");
    this.name = "GCSMountDirectoryAlreadyExistsError";
  }
}

export function isGCSMountDirectoryAlreadyExistsError(
  error: unknown
): error is GCSMountDirectoryAlreadyExistsError {
  return error instanceof GCSMountDirectoryAlreadyExistsError;
}
