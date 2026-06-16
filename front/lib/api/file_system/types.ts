/**
 * Shared types for the DustFileSystem abstraction.
 *
 * Scoped path: the agent/API-visible path format, e.g. `conversation-{cId}/report.pdf`
 * or `pod-{pId}/data.csv`. Every public interface accepts and returns scoped paths.
 *
 * FileSystemMount: one logical namespace (conversation or pod) with its scoped prefix,
 * sandbox mount point, backward-compat aliases, and per-mount permissions.
 */

export type FileSystemMountKind = "conversation" | "pod";

/** Canonical scoped-path prefixes (include the trailing dash). */
export const SCOPED_PREFIX_CONVERSATION = "conversation-" as const;
export const SCOPED_PREFIX_POD = "pod-" as const;

/** Legacy agent-visible path prefixes (no trailing dash/slash). */
export const LEGACY_PREFIX_CONVERSATION = "conversation" as const;
export const LEGACY_PREFIX_PROJECT = "project" as const;

export type FileSystemMount = {
  kind: FileSystemMountKind;

  /** sId of the conversation or space this mount is scoped to. */
  id: string;

  /** Prefix of every scoped path in this mount, e.g. `conversation-{cId}` or `pod-{pId}`. */
  scopedPrefix: string;

  /** Absolute sandbox path, e.g. `/files/conversation-{cId}`. */
  sandboxMountPoint: string;

  /**
   * Legacy scoped prefix (`"conversation"` or `"project"`) accepted for backward compat.
   * Null for mounts with no legacy counterpart.
   */
  legacyPrefix: string | null;

  /**
   * Legacy sandbox mount point (`/files/conversation` or `/files/pod`).
   * The sandbox adapter symlinks this to `sandboxMountPoint` after mounting.
   * Null when there is no legacy counterpart.
   */
  legacySandboxMountPoint: string | null;

  /** Resolved eagerly at factory time. */
  permissions: {
    canRead: boolean;
    canWrite: boolean;
  };
};

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

export type DustFileSystemErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_path"
  | "legacy_path"
  | "too_many_mounts"
  | "already_exists"
  | "internal";

export class DustFileSystemError extends Error {
  constructor(
    readonly code: DustFileSystemErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DustFileSystemError";
  }
}

export function isDustFileSystemError(
  err: unknown,
  code?: DustFileSystemErrorCode
): err is DustFileSystemError {
  return (
    err instanceof DustFileSystemError &&
    (code === undefined || err.code === code)
  );
}

// Do not import types in the generic file system.
export function conversationScopedPath({
  conversationId,
  rel,
}: {
  conversationId: string;
  rel: string;
}): string {
  return `${SCOPED_PREFIX_CONVERSATION}${conversationId}/${rel}`;
}

export function podScopedPath(spaceId: string, rel: string): string {
  return `${SCOPED_PREFIX_POD}${spaceId}/${rel}`;
}

export type GetSpaceFilesResponseBody = {
  files: FileSystemEntry[];
};

export type PostSpaceFolderResponseBody = {
  folder: FileSystemDirectoryEntry;
};
