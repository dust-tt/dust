/**
 * Shared types for the DustFileSystem abstraction.
 *
 * Scoped path: the agent/API-visible path format, e.g. `conversation-{cId}/report.pdf`,
 * `pod-{pId}/data.csv`, or `user-{uId}/memory.md`. Every public interface accepts and
 * returns scoped paths.
 *
 * FileSystemMount: one logical namespace (conversation, pod, or user) with its scoped
 * prefix, sandbox mount point, backward-compat aliases, and per-mount permissions.
 */

export type FileSystemMountKind = "conversation" | "pod" | "user";

/** Canonical scoped-path prefixes (include the trailing dash). */
export const SCOPED_PREFIX_CONVERSATION = "conversation-" as const;
export const SCOPED_PREFIX_POD = "pod-" as const;
export const SCOPED_PREFIX_USER = "user-" as const;

/** Legacy agent-visible path prefixes (no trailing dash/slash). */
export const LEGACY_PREFIX_CONVERSATION = "conversation" as const;
export const LEGACY_PREFIX_PROJECT = "project" as const;

export type FileSystemMount = {
  kind: FileSystemMountKind;

  /** sId of the conversation or space this mount is scoped to. */
  id: string;

  /** Prefix of every scoped path in this mount, e.g. `conversation-{cId}` or `pod-{pId}`. */
  scopedPrefix: string;

  /**
   * Absolute sandbox path, e.g. `/files/conversation-{cId}`. Null for scopes that are
   * never mounted into a sandbox (e.g. the user scope).
   */
  sandboxMountPoint: string | null;

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

/**
 * A mount that exists only inside the sandbox filesystem and is never exposed through the
 * scoped-path API (the agent's file tools never see it). Used for prefixes the sandbox must read
 * but that are not an agent-visible namespace, e.g. published sandbox-function bundles or the
 * pod-state litestream replica.
 */
type SandboxOnlyMountConfig = {
  sandboxMountPoint: string;
  readOnly: boolean;
};

export type SandboxOnlyMount = SandboxOnlyMountConfig &
  (
    | { kind: "frame_publications"; frameId: string }
    | { kind: "frame_state"; frameId: string }
    | { kind: "pod_sandbox_functions"; podId: string }
    | { kind: "pod_state"; podId: string }
  );

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

export function userScopedPath(userId: string, rel: string): string {
  return `${SCOPED_PREFIX_USER}${userId}/${rel}`;
}
