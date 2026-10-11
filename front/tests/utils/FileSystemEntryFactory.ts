import type {
  FileSystemDirectoryEntry,
  FileSystemFileEntry,
} from "@app/types/api/file_system/types";

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

// Sync, in-memory factory: entries of a file listing, named after the end of their path.
export class FileSystemEntryFactory {
  static file(
    overrides: Partial<FileSystemFileEntry> & { path: string }
  ): FileSystemFileEntry {
    return {
      isDirectory: false,
      fileName: nameOf(overrides.path),
      sizeBytes: 1,
      lastModifiedMs: 0,
      contentType: "application/octet-stream",
      fileId: "fil_1",
      thumbnailUrl: null,
      ...overrides,
    };
  }

  static directory(
    overrides: Partial<FileSystemDirectoryEntry> & { path: string }
  ): FileSystemDirectoryEntry {
    return {
      isDirectory: true,
      fileName: nameOf(overrides.path),
      sizeBytes: 0,
      lastModifiedMs: 0,
      ...overrides,
    };
  }
}
