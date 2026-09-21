export const ARCHIVE_FILE_EXTENSION = ".zip";
const ARCHIVE_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
]);

function isArchiveFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(ARCHIVE_FILE_EXTENSION) ||
    ARCHIVE_CONTENT_TYPES.has(file.type)
  );
}

/**
 * Splits a selection into the archives to expand and the files to upload as-is. ZIP is not a
 * supported upload content type, so an archive can only enter a Pod by being extracted.
 */
export function partitionArchiveFiles(files: File[]): {
  archives: File[];
  regularFiles: File[];
} {
  return {
    archives: files.filter(isArchiveFile),
    regularFiles: files.filter((file) => !isArchiveFile(file)),
  };
}
