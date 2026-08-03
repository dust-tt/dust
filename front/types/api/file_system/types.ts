/**
 * Shared file-system entry types and the file-listing transport DTOs.
 *
 * Scoped path: the agent/API-visible path format, e.g. `conversation-{cId}/report.pdf`
 * or `pod-{pId}/data.csv`. Entries always carry canonical scoped paths.
 */

type FileSystemEntryBase = {
  fileName: string;
  /** Full scoped path, e.g. `conversation-{cId}/folder/report.pdf`. Always canonical. */
  path: string;
  sizeBytes: number;
  lastModifiedMs: number;
};

export type FileSystemDirectoryEntry = FileSystemEntryBase & {
  isDirectory: true;
};

export type FileSystemFileEntry = FileSystemEntryBase & {
  isDirectory: false;
  contentType: string;
  /** sId of the corresponding FileResource record, or null when none exists. */
  fileId: string | null;
  thumbnailUrl: string | null;
  /** Present when the caller requested signed URLs. */
  signedDownloadUrl?: string | null;
};

export type FileSystemEntry = FileSystemDirectoryEntry | FileSystemFileEntry;

export type GetSpaceFilesResponseBody = {
  files: FileSystemEntry[];
};

export type PostSpaceFolderResponseBody = {
  folder: FileSystemDirectoryEntry;
};
