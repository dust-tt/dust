/**
 * DustFileSystem is the single entry point for all file system operations in the Dust platform.
 *
 * Scoped path: the agent/API-visible path format, e.g. `conversation-{cId}/report.pdf` or
 * `pod-{pId}/data.csv`. Every public method accepts and returns scoped paths.
 * Legacy paths (`conversation/...`, `project/...`) are accepted for backward compat.
 *
 * Factories:
 *   DustFileSystem.forConversation(auth, conversation)  conversation mount (+pod if project space)
 *   DustFileSystem.forPod(auth, space)                  pod (project-space) mount only
 *   DustFileSystem.fromScopedPath(auth, scopedPath)     infers context from the path prefix
 */

import config from "@app/lib/api/config";
import type { FileSystemBackend } from "@app/lib/api/file_system/backends/file_system_backend";
import { GCSFileSystemBackend } from "@app/lib/api/file_system/backends/gcs_file_system_backend";
import type {
  FileSystemEntry,
  FileSystemFileEntry,
  FileSystemMount,
} from "@app/lib/api/file_system/types";
import {
  DustFileSystemError,
  LEGACY_PREFIX_CONVERSATION,
  LEGACY_PREFIX_PROJECT,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system/types";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { Authenticator } from "@app/lib/auth";
import fileStorageConfig from "@app/lib/file_storage/config";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import { isSupportedImageContentType } from "@app/types/files";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import * as path from "path";
import type { Readable } from "stream";

export type {
  FileSystemEntry,
  FileSystemMount,
} from "@app/lib/api/file_system/types";
export { DustFileSystemError } from "@app/lib/api/file_system/types";

// ---------------------------------------------------------------------------
// Scoped-path prefix parsing
// ---------------------------------------------------------------------------

type ParsedScopedPrefix =
  | { kind: "conversation"; id: string }
  | { kind: "pod"; id: string };

function parseScopedPrefix(scopedPath: string): ParsedScopedPrefix | null {
  const prefix = scopedPath.includes("/")
    ? scopedPath.slice(0, scopedPath.indexOf("/"))
    : scopedPath;

  if (prefix.startsWith(SCOPED_PREFIX_CONVERSATION)) {
    const id = prefix.slice(SCOPED_PREFIX_CONVERSATION.length);

    return id ? { kind: "conversation", id } : null;
  }

  if (prefix.startsWith(SCOPED_PREFIX_POD)) {
    const id = prefix.slice(SCOPED_PREFIX_POD.length);

    return id ? { kind: "pod", id } : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// DustFileSystem
// ---------------------------------------------------------------------------

export class DustFileSystem {
  private constructor(
    private readonly auth: Authenticator,
    private readonly mounts: ReadonlyArray<FileSystemMount>,
    private readonly backend: FileSystemBackend
  ) {}

  // --------------------------------------------------------------------------
  // Factories
  // --------------------------------------------------------------------------

  /**
   * Build a DustFileSystem scoped to a conversation.
   *
   * Always includes the conversation mount. When the conversation belongs to a project space,
   * the pod mount is added with permissions derived from the space's canRead/canWrite checks.
   */
  static async forConversation(
    auth: Authenticator,
    // TODO(FILE SYSTEM MIGRATION): Ideally, we accept a ConversationResource directly.
    conversation: ConversationWithoutContentType
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    const owner = auth.getNonNullableWorkspace();

    const convMount: FileSystemMount = {
      kind: "conversation",
      id: conversation.sId,
      scopedPrefix: `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}`,
      sandboxMountPoint: `/files/${SCOPED_PREFIX_CONVERSATION}${conversation.sId}`,
      legacyPrefix: LEGACY_PREFIX_CONVERSATION,
      legacySandboxMountPoint: `/files/${LEGACY_PREFIX_CONVERSATION}`,
      // Conversation access is always read+write when the caller holds a valid auth for it.
      // The handler is responsible for verifying conversation access before calling this factory.
      permissions: { canRead: true, canWrite: true },
    };

    const mounts: FileSystemMount[] = [convMount];

    if (isProjectConversation(conversation)) {
      const space = await SpaceResource.fetchById(auth, conversation.spaceId);
      if (space) {
        mounts.push({
          kind: "pod",
          id: space.sId,
          scopedPrefix: `${SCOPED_PREFIX_POD}${space.sId}`,
          sandboxMountPoint: `/files/${SCOPED_PREFIX_POD}${space.sId}`,
          legacyPrefix: LEGACY_PREFIX_PROJECT,
          legacySandboxMountPoint: `/files/${LEGACY_PREFIX_PROJECT}`,
          permissions: {
            canRead: space.canRead(auth),
            canWrite: space.canWrite(auth),
          },
        });
      }
    }

    const backend = new GCSFileSystemBackend(
      owner.sId,
      fileStorageConfig.getGcsPrivateUploadsBucket()
    );

    return new Ok(new DustFileSystem(auth, mounts, backend));
  }

  /**
   * Build a DustFileSystem scoped to a pod (project space).
   * Returns `Err("unauthorized")` when the caller does not have read access to the space.
   */
  static async forPod(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    if (!space.canRead(auth)) {
      return new Err(
        new DustFileSystemError(
          "unauthorized",
          "You do not have read access to this space."
        )
      );
    }

    const owner = auth.getNonNullableWorkspace();
    const mount: FileSystemMount = {
      kind: "pod",
      id: space.sId,
      scopedPrefix: `${SCOPED_PREFIX_POD}${space.sId}`,
      sandboxMountPoint: `/files/${SCOPED_PREFIX_POD}${space.sId}`,
      legacyPrefix: LEGACY_PREFIX_PROJECT,
      legacySandboxMountPoint: `/files/${LEGACY_PREFIX_PROJECT}`,
      permissions: {
        canRead: true,
        canWrite: space.canWrite(auth),
      },
    };

    const backend = new GCSFileSystemBackend(
      owner.sId,
      fileStorageConfig.getGcsPrivateUploadsBucket()
    );

    return new Ok(new DustFileSystem(auth, [mount], backend));
  }

  /**
   * Build a DustFileSystem by inferring context from the scoped path prefix.
   *
   * `conversation-{cId}/...` fetches the conversation and delegates to forConversation.
   * `pod-{pId}/...`          fetches the space and delegates to forPod.
   *
   * Returns `Err("not_found")` when the resource is missing,
   * `Err("invalid_path")` for unrecognised prefixes.
   */
  static async fromScopedPath(
    auth: Authenticator,
    scopedPath: string
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    const parsed = parseScopedPrefix(scopedPath);
    if (!parsed) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `Cannot infer file system context from path: ${scopedPath}`
        )
      );
    }

    switch (parsed.kind) {
      case "conversation": {
        const conversation = await ConversationResource.fetchById(
          auth,
          parsed.id
        );
        if (!conversation) {
          return new Err(
            new DustFileSystemError(
              "not_found",
              `Conversation not found: ${parsed.id}`
            )
          );
        }

        return DustFileSystem.forConversation(auth, conversation.toJSON());
      }

      case "pod": {
        const space = await SpaceResource.fetchById(auth, parsed.id);
        if (!space) {
          return new Err(
            new DustFileSystemError(
              "not_found",
              `Space not found: ${parsed.id}`
            )
          );
        }

        return DustFileSystem.forPod(auth, space);
      }

      default:
        assertNever(parsed);
    }
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  /** Returns the mount the path belongs to by canonical prefix only. */
  private findMount(scopedPath: string): FileSystemMount | null {
    for (const mount of this.mounts) {
      if (
        scopedPath === mount.scopedPrefix ||
        scopedPath.startsWith(`${mount.scopedPrefix}/`)
      ) {
        return mount;
      }
    }
    return null;
  }

  /**
   * Returns true when `scopedPath` uses the old agent-visible format
   * (`conversation/...` or `project/...`). Used to produce a helpful error
   * instead of a generic invalid_path when the model passes a stale path.
   */
  private static isLegacyPath(scopedPath: string): boolean {
    return (
      scopedPath === LEGACY_PREFIX_CONVERSATION ||
      scopedPath.startsWith(`${LEGACY_PREFIX_CONVERSATION}/`) ||
      scopedPath === LEGACY_PREFIX_PROJECT ||
      scopedPath.startsWith(`${LEGACY_PREFIX_PROJECT}/`)
    );
  }

  /**
   * Normalizes a caller-supplied scoped path using POSIX rules (resolves `.` and `..`).
   *
   * Returns `null` when the result would escape the scoped namespace : i.e. when the
   * normalized path starts with `..` (path traversal) or `/` (absolute path injection).
   * This is the primary defense against path-traversal attacks.
   */
  static normalizeScopedPath(scopedPath: string): string | null {
    const normalized = path.posix.normalize(scopedPath);
    if (
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized.startsWith("/")
    ) {
      return null;
    }

    return normalized;
  }

  private requireReadMount(
    scopedPath: string
  ): Result<{ mount: FileSystemMount; path: string }, DustFileSystemError> {
    const normalized = DustFileSystem.normalizeScopedPath(scopedPath);
    if (!normalized) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `Path traversal detected: \`${scopedPath}\` is not allowed.`
        )
      );
    }

    const mount = this.findMount(normalized);
    if (!mount) {
      if (DustFileSystem.isLegacyPath(normalized)) {
        return new Err(
          new DustFileSystemError(
            "legacy_path",
            `Path \`${normalized}\` uses an outdated format. Call \`files__list\` to get current paths.`
          )
        );
      }

      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `Path does not belong to any known mount: ${normalized}`
        )
      );
    }

    if (!mount.permissions.canRead) {
      return new Err(
        new DustFileSystemError(
          "unauthorized",
          `Read access denied for mount: ${mount.scopedPrefix}`
        )
      );
    }

    return new Ok({ mount, path: normalized });
  }

  private requireWriteMount(
    scopedPath: string
  ): Result<{ mount: FileSystemMount; path: string }, DustFileSystemError> {
    const normalized = DustFileSystem.normalizeScopedPath(scopedPath);
    if (!normalized) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `Path traversal detected: \`${scopedPath}\` is not allowed.`
        )
      );
    }

    const mount = this.findMount(normalized);
    if (!mount) {
      if (DustFileSystem.isLegacyPath(normalized)) {
        return new Err(
          new DustFileSystemError(
            "legacy_path",
            `Path \`${normalized}\` uses an outdated format. Call \`files__list\` to get current paths.`
          )
        );
      }

      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `Path does not belong to any known mount: ${normalized}`
        )
      );
    }

    if (!mount.permissions.canWrite) {
      return new Err(
        new DustFileSystemError(
          "unauthorized",
          `Write access denied for mount: ${mount.scopedPrefix}`
        )
      );
    }

    return new Ok({ mount, path: normalized });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  getMounts(): ReadonlyArray<FileSystemMount> {
    return this.mounts;
  }

  /**
   * Constructs the thumbnail API URL for an image file entry.
   * Lives here because the URL points to our application API, not to GCS.
   */
  private buildThumbnailUrl(
    entry: FileSystemFileEntry,
    workspaceId: string
  ): string | null {
    if (!isSupportedImageContentType(entry.contentType)) {
      return null;
    }
    const mount = this.findMount(entry.path);
    if (!mount) {
      return null;
    }
    switch (mount.kind) {
      case "conversation":
        return (
          `${config.getApiBaseUrl()}/api/w/${workspaceId}` +
          `/assistant/conversations/${mount.id}/files/thumbnail` +
          `?filePath=${encodeURIComponent(entry.path)}`
        );

      case "pod":
        // TODO(FILE SYSTEM): expose a pod-files thumbnail endpoint.
        return null;

      default:
        assertNever(mount.kind);
    }
  }

  /**
   * List entries under `scopedPath`.
   * When `scopedPath` is omitted, lists across all readable mounts.
   * Thumbnail URLs are populated here (not in the backend) since they point to our API.
   */
  async list(
    scopedPath?: string,
    opts?: { maxFiles?: number; includeProcessed?: boolean }
  ): Promise<FileSystemEntry[]> {
    const workspaceId = this.auth.getNonNullableWorkspace().sId;
    const withThumbnails = (entries: FileSystemEntry[]): FileSystemEntry[] =>
      entries.map((entry) =>
        entry.isDirectory
          ? entry
          : {
              ...entry,
              thumbnailUrl: this.buildThumbnailUrl(entry, workspaceId),
            }
      );

    if (scopedPath !== undefined) {
      const resolved = this.requireReadMount(scopedPath);
      if (resolved.isErr()) {
        logger.warn(
          { err: resolved.error, scopedPath },
          "DustFileSystem.list: access check failed"
        );
        return [];
      }
      return withThumbnails(await this.backend.list(resolved.value.path, opts));
    }

    const results: FileSystemEntry[] = [];
    for (const mount of this.mounts) {
      if (!mount.permissions.canRead) {
        continue;
      }
      const entries = await this.backend.list(`${mount.scopedPrefix}/`, opts);
      results.push(...withThumbnails(entries));
    }
    return results;
  }

  /**
   * Returns `Ok(null)` when the file does not exist, `Ok(Readable)` on success.
   * The caller owns the stream and must consume or destroy it.
   * Returns `Err` for path/permission errors (including `legacy_path`).
   */
  async read(
    scopedPath: string
  ): Promise<Result<Readable | null, DustFileSystemError>> {
    const resolved = this.requireReadMount(scopedPath);
    if (resolved.isErr()) {
      return resolved;
    }
    return this.backend.read(resolved.value.path);
  }

  /**
   * Returns metadata for the file at `scopedPath`, or `Ok(null)` when not found.
   * Returns `Err` for path/permission errors (including `legacy_path`).
   */
  async stat(
    scopedPath: string
  ): Promise<
    Result<
      { contentType: string; sizeBytes: number } | null,
      DustFileSystemError
    >
  > {
    const resolved = this.requireReadMount(scopedPath);
    if (resolved.isErr()) {
      return resolved;
    }

    return this.backend.stat(resolved.value.path);
  }

  async write(
    scopedPath: string,
    content: Buffer | string,
    contentType: string
  ): Promise<Result<void, DustFileSystemError>> {
    const resolved = this.requireWriteMount(scopedPath);
    if (resolved.isErr()) {
      return resolved;
    }

    return this.backend.write(resolved.value.path, content, contentType);
  }

  async delete(
    scopedPath: string,
    opts?: { ignoreNotFound?: boolean }
  ): Promise<Result<void, DustFileSystemError>> {
    const resolved = this.requireWriteMount(scopedPath);
    if (resolved.isErr()) {
      return resolved;
    }
    return this.backend.delete(resolved.value.path, opts);
  }

  /** `src` requires read access, `dest` requires write access. */
  async copy({
    src,
    dest,
  }: {
    src: string;
    dest: string;
  }): Promise<Result<void, DustFileSystemError>> {
    const resolvedSrc = this.requireReadMount(src);
    if (resolvedSrc.isErr()) {
      return resolvedSrc;
    }
    const resolvedDest = this.requireWriteMount(dest);
    if (resolvedDest.isErr()) {
      return resolvedDest;
    }
    return this.backend.copy({
      src: resolvedSrc.value.path,
      dest: resolvedDest.value.path,
    });
  }

  /**
   * Move `src` to `dest` (copy then delete source).
   *
   * GCS has no atomic rename so this is copy-then-delete. When the source deletion fails
   * after a successful copy, returns `Ok({ sourceDeletionFailed: true })` rather than
   * `Err` because the destination is already the authoritative copy.
   */
  async move({
    src,
    dest,
  }: {
    src: string;
    dest: string;
  }): Promise<Result<{ sourceDeletionFailed: boolean }, DustFileSystemError>> {
    const resolvedSrc = this.requireWriteMount(src);
    if (resolvedSrc.isErr()) {
      return resolvedSrc;
    }
    const resolvedDest = this.requireWriteMount(dest);
    if (resolvedDest.isErr()) {
      return resolvedDest;
    }

    const copyResult = await this.backend.copy({
      src: resolvedSrc.value.path,
      dest: resolvedDest.value.path,
    });
    if (copyResult.isErr()) {
      return copyResult;
    }

    const deleteResult = await this.backend.delete(resolvedSrc.value.path);
    if (deleteResult.isErr()) {
      logger.error(
        {
          err: deleteResult.error,
          src: resolvedSrc.value.path,
          dest: resolvedDest.value.path,
        },
        "DustFileSystem.move: source delete failed after successful copy"
      );
      return new Ok({ sourceDeletionFailed: true });
    }

    return new Ok({ sourceDeletionFailed: false });
  }

  async getDownloadUrl(
    scopedPath: string,
    opts?: { expiresInMs?: number; fileName?: string }
  ): Promise<Result<string, DustFileSystemError>> {
    const resolved = this.requireReadMount(scopedPath);
    if (resolved.isErr()) {
      return resolved;
    }
    return this.backend.getDownloadUrl(resolved.value.path, opts);
  }

  /** No-ops when the sandbox image does not support the required capability. */
  async setupSandboxMount(
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>> {
    const adapter = this.backend.createSandboxAdapter(this.mounts);
    return adapter.setup(this.auth, sandbox, image);
  }

  /** Refresh the storage credential in an already-mounted sandbox. */
  async refreshSandboxMount(
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>> {
    const adapter = this.backend.createSandboxAdapter(this.mounts);
    return adapter.refreshCredential(this.auth, sandbox, image);
  }
}
