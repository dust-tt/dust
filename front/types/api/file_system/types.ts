/**
 * Shared file-system entry types and the file-listing transport DTOs.
 *
 * Scoped path: the agent/API-visible path format, e.g. `conversation-{cId}/report.pdf`
 * or `pod-{pId}/data.csv`. Entries always carry canonical scoped paths.
 */

import type { DfmMessage } from "@app/lib/markdown/dfm";

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
  /** Semantic type of the linked FileResource, when it differs from the source bytes. */
  fileResourceContentType?: string;
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

export type PostExtractArchiveResponseBody = {
  directoriesCreated: number;
  filesWritten: number;
  skippedEntryCount: number;
};

/** The key checking DFM comment signatures, as base64url SPKI DER, or null when unset. */
export type GetDfmCommentSigningKeyResponseBody = {
  publicKey: string | null;
};

export type PostDfmCommentSignatureRequestBody = {
  /** Scoped path of the file the comment is written in. */
  filePath: string;
  commentId: string;
  /** Index of the new message in its thread: 0 for a new thread. */
  position: number;
  /** The message the new one follows in its thread, or null for a new thread. */
  previous: Pick<DfmMessage, "author" | "createdAt" | "body"> | null;
  body: string;
};

/** The message to insert in the comment: the server's author, name, timestamp and signature. */
export type PostDfmCommentSignatureResponseBody = {
  message: DfmMessage;
};
