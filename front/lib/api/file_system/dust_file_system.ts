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

import { GCSFileSystemBackend } from "@app/lib/api/file_system/backends/gcs_file_system_backend";
import type { FileSystemBackend } from "@app/lib/api/file_system/backends/file_system_backend";
import type {
  FileSystemEntry,
  FileSystemMount,
} from "@app/lib/api/file_system/types";
import { DustFileSystemError } from "@app/lib/api/file_system/types";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { Authenticator } from "@app/lib/auth";
import fileStorageConfig from "@app/lib/file_storage/config";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type { FileSystemEntry, FileSystemMount } from "@app/lib/api/file_system/types";
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

  if (prefix.startsWith("conversation-")) {
    const id = prefix.slice("conversation-".length);
    return id ? { kind: "conversation", id } : null;
  }
  if (prefix.startsWith("pod-")) {
    const id = prefix.slice("pod-".length);
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
    conversation: ConversationWithoutContentType
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    const owner = auth.getNonNullableWorkspace();

    const convMount: FileSystemMount = {
      kind: "conversation",
      id: conversation.sId,
      scopedPrefix: `conversation-${conversation.sId}`,
      sandboxMountPoint: `/files/conversation-${conversation.sId}`,
      legacyPrefix: "conversation",
      legacySandboxMountPoint: "/files/conversation",
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
          scopedPrefix: `pod-${space.sId}`,
          sandboxMountPoint: `/files/pod-${space.sId}`,
          legacyPrefix: "project",
          legacySandboxMountPoint: "/files/project",
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
        new DustFileSystemError("unauthorized", "You do not have read access to this space.")
      );
    }

    const owner = auth.getNonNullableWorkspace();
    const mount: FileSystemMount = {
      kind: "pod",
      id: space.sId,
      scopedPrefix: `pod-${space.sId}`,
      sandboxMountPoint: `/files/pod-${space.sId}`,
      legacyPrefix: "project",
      legacySandboxMountPoint: "/files/project",
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
        const conversation = await ConversationResource.fetchById(auth, parsed.id);
        if (!conversation) {
          return new Err(
            new DustFileSystemError("not_found", `Conversation not found: ${parsed.id}`)
          );
        }
        return DustFileSystem.forConversation(auth, conversation.toJSON());
      }

      case "pod": {
        const space = await SpaceResource.fetchById(auth, parsed.id);
        if (!space) {
          return new Err(
            new DustFileSystemError("not_found", `Space not found: ${parsed.id}`)
          );
        }
        return DustFileSystem.forPod(auth, space);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Internal helpers
  // --------------------------------------------------------------------------

  /** Returns the mount the path belongs to, checking both canonical and legacy prefixes. */
  private findMount(scopedPath: string): FileSystemMount | null {
    for (const mount of this.mounts) {
      if (
        scopedPath === mount.scopedPrefix ||
        scopedPath.startsWith(`${mount.scopedPrefix}/`)
      ) {
        return mount;
      }
      if (
        mount.legacyPrefix &&
        (scopedPath === mount.legacyPrefix ||
          scopedPath.startsWith(`${mount.legacyPrefix}/`))
      ) {
        return mount;
      }
    }
    return null;
  }

  /**
   * Rewrite a legacy path to its canonical form.
   * `"conversation/report.pdf"` with the conversation mount -> `"conversation-{cId}/report.pdf"`.
   */
  private canonicalizePath(scopedPath: string, mount: FileSystemMount): string {
    if (mount.legacyPrefix && scopedPath.startsWith(`${mount.legacyPrefix}/`)) {
      return `${mount.scopedPrefix}/${scopedPath.slice(mount.legacyPrefix.length + 1)}`;
    }
    if (scopedPath === mount.legacyPrefix) {
      return mount.scopedPrefix;
    }
    return scopedPath;
  }

  private requireReadMount(
    scopedPath: string
  ): Result<{ mount: FileSystemMount; path: string }, DustFileSystemError> {
    const mount = this.findMount(scopedPath);
    if (!mount) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `Path does not belong to any known mount: ${scopedPath}`
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
    return new Ok({ mount, path: this.canonicalizePath(scopedPath, mount) });
  }

  private requireWriteMount(
    scopedPath: string
  ): Result<{ mount: FileSystemMount; path: string }, DustFileSystemError> {
    const mount = this.findMount(scopedPath);
    if (!mount) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `Path does not belong to any known mount: ${scopedPath}`
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
    return new Ok({ mount, path: this.canonicalizePath(scopedPath, mount) });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  getMounts(): ReadonlyArray<FileSystemMount> {
    return this.mounts;
  }

  /**
   * List entries under `scopedPath`.
   * When `scopedPath` is omitted, lists across all readable mounts.
   */
  async list(
    scopedPath?: string,
    opts?: { maxFiles?: number; includeProcessed?: boolean }
  ): Promise<FileSystemEntry[]> {
    if (scopedPath !== undefined) {
      const resolved = this.requireReadMount(scopedPath);
      if (resolved.isErr()) {
        logger.warn({ err: resolved.error, scopedPath }, "DustFileSystem.list: access check failed");
        return [];
      }
      return this.backend.list(resolved.value.path, opts);
    }

    const results: FileSystemEntry[] = [];
    for (const mount of this.mounts) {
      if (!mount.permissions.canRead) {
        continue;
      }
      const entries = await this.backend.list(`${mount.scopedPrefix}/`, opts);
      results.push(...entries);
    }
    return results;
  }

  /** Returns `null` when not found rather than throwing. */
  async read(scopedPath: string): Promise<Buffer | null> {
    const resolved = this.requireReadMount(scopedPath);
    if (resolved.isErr()) {
      return null;
    }
    return this.backend.read(resolved.value.path);
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
    try {
      await this.backend.write(resolved.value.path, content, contentType);
      return new Ok(undefined);
    } catch (err) {
      return new Err(new DustFileSystemError("internal", normalizeError(err).message));
    }
  }

  async delete(
    scopedPath: string,
    opts?: { ignoreNotFound?: boolean }
  ): Promise<Result<void, DustFileSystemError>> {
    const resolved = this.requireWriteMount(scopedPath);
    if (resolved.isErr()) {
      return resolved;
    }
    try {
      await this.backend.delete(resolved.value.path, opts);
      return new Ok(undefined);
    } catch (err) {
      return new Err(new DustFileSystemError("internal", normalizeError(err).message));
    }
  }

  /** `src` requires read access, `dest` requires write access. */
  async copy(
    src: string,
    dest: string
  ): Promise<Result<void, DustFileSystemError>> {
    const resolvedSrc = this.requireReadMount(src);
    if (resolvedSrc.isErr()) {
      return resolvedSrc;
    }
    const resolvedDest = this.requireWriteMount(dest);
    if (resolvedDest.isErr()) {
      return resolvedDest;
    }
    try {
      await this.backend.copy(resolvedSrc.value.path, resolvedDest.value.path);
      return new Ok(undefined);
    } catch (err) {
      return new Err(new DustFileSystemError("internal", normalizeError(err).message));
    }
  }

  /**
   * Move `src` to `dest` (copy then delete source).
   *
   * GCS has no atomic rename so this is copy-then-delete. When the source deletion fails
   * after a successful copy, returns `Ok({ sourceDeletionFailed: true })` rather than
   * `Err` because the destination is already the authoritative copy.
   */
  async move(
    src: string,
    dest: string
  ): Promise<Result<{ sourceDeletionFailed: boolean }, DustFileSystemError>> {
    const resolvedSrc = this.requireWriteMount(src);
    if (resolvedSrc.isErr()) {
      return resolvedSrc;
    }
    const resolvedDest = this.requireWriteMount(dest);
    if (resolvedDest.isErr()) {
      return resolvedDest;
    }

    try {
      await this.backend.copy(resolvedSrc.value.path, resolvedDest.value.path);
    } catch (err) {
      return new Err(new DustFileSystemError("internal", normalizeError(err).message));
    }

    try {
      await this.backend.delete(resolvedSrc.value.path);
    } catch (err) {
      logger.error(
        { err: normalizeError(err), src: resolvedSrc.value.path, dest: resolvedDest.value.path },
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
    try {
      const url = await this.backend.getDownloadUrl(resolved.value.path, opts);
      return new Ok(url);
    } catch (err) {
      return new Err(new DustFileSystemError("internal", normalizeError(err).message));
    }
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
