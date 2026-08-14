/**
 * Shared types and helpers for the DustFileSystem abstraction.
 *
 * Scoped path: the agent/API-visible path format, e.g. `conversation-{cId}/report.pdf`,
 * `pod-{pId}/data.csv`, or `user-{uId}/memory.md`. Every public interface accepts and
 * returns scoped paths.
 *
 * FileSystemMount: one logical namespace (conversation, pod, or user) with its scoped
 * prefix, sandbox mount point, backward-compat aliases, and per-mount permissions.
 */

export type FileSystemMountKind = "conversation" | "pod" | "user";

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
export type SandboxOnlyMountKind = "pod_sandbox_functions" | "pod_state";

export type SandboxOnlyMount = {
  kind: SandboxOnlyMountKind;

  /** sId of the pod this mount belongs to. */
  id: string;

  sandboxMountPoint: string;

  readOnly: boolean;
};

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

/** Canonical scoped-path prefixes (include the trailing dash). */
export const SCOPED_PREFIX_CONVERSATION = "conversation-" as const;
export const SCOPED_PREFIX_POD = "pod-" as const;
export const SCOPED_PREFIX_USER = "user-" as const;

/** Legacy agent-visible path prefixes (no trailing dash/slash). */
export const LEGACY_PREFIX_CONVERSATION = "conversation" as const;
export const LEGACY_PREFIX_POD = "pod" as const;
export const LEGACY_PREFIX_PROJECT = "project" as const;

export const TOOL_OUTPUTS_FOLDER_NAME = ".tool_outputs";

export type CanonicalScopedPathScope =
  | { kind: "canonical-conversation"; id: string }
  | { kind: "canonical-pod"; id: string };

export type ParsedCanonicalScopedPath = {
  scope: CanonicalScopedPathScope;
  relPath: string;
};

export type ScopedFilePathPrefix =
  | typeof LEGACY_PREFIX_CONVERSATION
  | typeof LEGACY_PREFIX_POD;

export type ScopedFilePath = {
  prefix: ScopedFilePathPrefix;
  rel: string;
};

export type ParsedScopedPathScope =
  | CanonicalScopedPathScope
  | { kind: "legacy"; prefix: ScopedFilePathPrefix };

export function parseScopedFilePathPrefix(
  rawScope: string
): ScopedFilePathPrefix | null {
  switch (rawScope) {
    case LEGACY_PREFIX_CONVERSATION:
    case LEGACY_PREFIX_POD:
      return rawScope;
    default:
      return null;
  }
}

export function parseCanonicalScopedPathScope(
  rawScope: string
): CanonicalScopedPathScope | null {
  if (rawScope.startsWith(SCOPED_PREFIX_CONVERSATION)) {
    const id = rawScope.slice(SCOPED_PREFIX_CONVERSATION.length);
    return id ? { kind: "canonical-conversation", id } : null;
  }

  if (rawScope.startsWith(SCOPED_PREFIX_POD)) {
    const id = rawScope.slice(SCOPED_PREFIX_POD.length);
    return id ? { kind: "canonical-pod", id } : null;
  }

  return null;
}

/**
 * Parse a canonical agent-visible scoped path (`conversation-{id}/...`, `pod-{id}/...`)
 * into its scope and path relative to that mount.
 */
export function parseCanonicalScopedPath(
  scopedPath: string
): ParsedCanonicalScopedPath | null {
  const slashIndex = scopedPath.indexOf("/");
  const rawScope =
    slashIndex === -1 ? scopedPath : scopedPath.slice(0, slashIndex);
  const relPath = slashIndex === -1 ? "" : scopedPath.slice(slashIndex + 1);
  const scope = parseCanonicalScopedPathScope(rawScope);

  return scope ? { scope, relPath } : null;
}

export function parseScopedPathScope(
  rawScope: string
): ParsedScopedPathScope | null {
  const canonicalScope = parseCanonicalScopedPathScope(rawScope);
  if (canonicalScope) {
    return canonicalScope;
  }

  const legacyPrefix = parseScopedFilePathPrefix(rawScope);
  return legacyPrefix ? { kind: "legacy", prefix: legacyPrefix } : null;
}

/**
 * Parse a scoped file path like "conversation/chart.png" or "pod/report.pdf".
 * Returns null if the path is missing a valid scope prefix.
 */
export function parseScopedFilePath(filePath: string): ScopedFilePath | null {
  const slashIndex = filePath.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }

  const prefix = parseScopedFilePathPrefix(filePath.slice(0, slashIndex));
  return prefix ? { prefix, rel: filePath.slice(slashIndex + 1) } : null;
}

function getScopedPathPrefix(scopedPath: string): string | null {
  const slashIndex = scopedPath.indexOf("/");
  return slashIndex > 0 ? scopedPath.slice(0, slashIndex) : null;
}

/**
 * True for canonical agent-visible paths (`conversation-{id}/...`, `pod-{id}/...`).
 * The id segment after the prefix must be non-empty.
 */
export function isCanonicalScopedPath(scopedPath: string): boolean {
  const prefix = getScopedPathPrefix(scopedPath);
  return prefix ? parseCanonicalScopedPathScope(prefix) !== null : false;
}

/** True for legacy bare-prefix paths (`conversation/...`, `pod/...`, `project/...`). */
export function isLegacyScopedPath(scopedPath: string): boolean {
  const prefix = getScopedPathPrefix(scopedPath);
  return (
    prefix === LEGACY_PREFIX_CONVERSATION ||
    prefix === LEGACY_PREFIX_POD ||
    prefix === LEGACY_PREFIX_PROJECT
  );
}

/** True for any agent-visible scoped path (canonical or legacy). */
export function isAgentScopedPath(scopedPath: string): boolean {
  return isCanonicalScopedPath(scopedPath) || isLegacyScopedPath(scopedPath);
}

/** Match a requested legacy scoped path against a stored legacy alias. */
export function legacyScopedPathsMatch(
  storedLegacyPath: string | undefined,
  requestedRef: string
): boolean {
  if (!storedLegacyPath) {
    return false;
  }

  if (storedLegacyPath === requestedRef) {
    return true;
  }

  // Older frame code may request `project/...` while the stored alias uses `pod/...`.
  return (
    requestedRef.startsWith(`${LEGACY_PREFIX_PROJECT}/`) &&
    storedLegacyPath ===
      `${LEGACY_PREFIX_POD}/${requestedRef.slice(`${LEGACY_PREFIX_PROJECT}/`.length)}`
  );
}

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
