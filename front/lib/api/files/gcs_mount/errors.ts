export class GCSMountDirectoryAlreadyExistsError extends Error {
  constructor() {
    super("Folder already exists.");
    this.name = "GCSMountDirectoryAlreadyExistsError";
  }
}
