/**
 * DustFileSystem is the single entry point for all file system operations in the Dust platform.
 *
 * Scoped path: the agent/API-visible path format, e.g. `conversation-{cId}/report.pdf`,
 * `pod-{pId}/data.csv`, or `user-{uId}/MEMORY.md`. Every public method accepts and returns
 * scoped paths. Legacy paths (`conversation/...`, `project/...`) are accepted for backward compat.
 *
 * Factories:
 *   DustFileSystem.forConversation(auth, conversation)   single conversation mount (+pod if project space)
 *   DustFileSystem.forConversations(auth, conversations) multiple conversation mounts (+pod if project space)
 *   DustFileSystem.forPod(auth, space)                   single pod mount
 *   DustFileSystem.forUser(auth)                         the authenticated user's own memory scope
 *   DustFileSystem.fromScopedPath(auth, scopedPath)     infers context from the path prefix
 *   DustFileSystem.forAgentLoop(auth, { conversation, scopedPaths })
 *       defaults to the agent loop conversation (+ its pod when applicable), plus any
 *       conversation/pod mounts referenced in scopedPaths that the user can access
 */

import config from "@app/lib/api/config";
import { DatabaseFileSystemBackend } from "@app/lib/api/file_system/backends/database_file_system_backend";
import type {
  FileSystemBackend,
  FileSystemNodeIdentity,
} from "@app/lib/api/file_system/backends/file_system_backend";
import { GCSFileSystemBackend } from "@app/lib/api/file_system/backends/gcs_file_system_backend";
import type { FileSystemStorageMode } from "@app/lib/api/file_system/storage_mode";
import {
  fileSystemStorageModeForPod,
  fileSystemStorageModeForStandaloneConversation,
} from "@app/lib/api/file_system/storage_mode";
import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { Authenticator } from "@app/lib/auth";
import fileStorageConfig from "@app/lib/file_storage/config";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type {
  FileSystemDirectoryEntry,
  FileSystemEntry,
  FileSystemFileEntry,
} from "@app/types/api/file_system/types";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { FileSystemMount, SandboxOnlyMount } from "@app/types/file_system";
import {
  DustFileSystemError,
  LEGACY_PREFIX_CONVERSATION,
  LEGACY_PREFIX_PROJECT,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
  SCOPED_PREFIX_USER,
} from "@app/types/file_system";
import { isSupportedImageContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";
import * as path from "path";
import type { Readable } from "stream";

export type { FileSystemEntry } from "@app/types/api/file_system/types";
export type { FileSystemMount } from "@app/types/file_system";
export { DustFileSystemError } from "@app/types/file_system";

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F-\x9F]/g;

// Strip control characters, replace path separators, trim whitespace, and NFC-normalize.
// macOS uploads commonly arrive in NFD; NFC normalization keeps paths stable when consumers
// echo them back. "/" is replaced with "_" since it would otherwise be interpreted as a path
// separator when the name is used as a path segment.
export function sanitizeFileSystemName(name: string): string {
  return name
    .replace(CONTROL_CHAR_RE, "")
    .replace(/\//g, "_")
    .trim()
    .normalize("NFC");
}

type ParsedScopedPrefix =
  | { kind: "conversation"; id: string }
  | { kind: "pod"; id: string }
  | { kind: "user"; id: string };

export function parseScopedPrefix(
  scopedPath: string
): ParsedScopedPrefix | null {
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

  if (prefix.startsWith(SCOPED_PREFIX_USER)) {
    const id = prefix.slice(SCOPED_PREFIX_USER.length);

    return id ? { kind: "user", id } : null;
  }

  return null;
}

function createConversationMount(
  conversation: ConversationWithoutContentType,
  { includeLegacy }: { includeLegacy: boolean }
): FileSystemMount {
  return {
    kind: "conversation",
    id: conversation.sId,
    scopedPrefix: `${SCOPED_PREFIX_CONVERSATION}${conversation.sId}`,
    sandboxMountPoint: `/files/${SCOPED_PREFIX_CONVERSATION}${conversation.sId}`,
    legacyPrefix: includeLegacy ? LEGACY_PREFIX_CONVERSATION : null,
    legacySandboxMountPoint: includeLegacy
      ? `/files/${LEGACY_PREFIX_CONVERSATION}`
      : null,
    // Conversation access is always read+write when fetchById returned the resource.
    permissions: { canRead: true, canWrite: true },
  };
}

function createPodMount(
  auth: Authenticator,
  space: SpaceResource,
  { includeLegacy }: { includeLegacy: boolean }
): FileSystemMount {
  return {
    kind: "pod",
    id: space.sId,
    scopedPrefix: `${SCOPED_PREFIX_POD}${space.sId}`,
    sandboxMountPoint: `/files/${SCOPED_PREFIX_POD}${space.sId}`,
    legacyPrefix: includeLegacy ? LEGACY_PREFIX_PROJECT : null,
    legacySandboxMountPoint: includeLegacy ? `/files/pod` : null,
    permissions: {
      canRead: auth.can("read", space),
      canWrite: auth.can("write", space),
    },
  };
}

function createUserMount(userId: string): FileSystemMount {
  return {
    kind: "user",
    id: userId,
    scopedPrefix: `${SCOPED_PREFIX_USER}${userId}`,
    sandboxMountPoint: null,
    legacyPrefix: null,
    legacySandboxMountPoint: null,
    permissions: {
      canRead: true,
      canWrite: true,
    },
  };
}

function collectScopedPrefixesFromPaths(scopedPaths: string[]): {
  conversationIds: Set<string>;
  podIds: Set<string>;
  userIds: Set<string>;
} {
  const conversationIds = new Set<string>();
  const podIds = new Set<string>();
  const userIds = new Set<string>();

  for (const scopedPath of scopedPaths) {
    const parsed = parseScopedPrefix(scopedPath);
    if (!parsed) {
      continue;
    }
    switch (parsed.kind) {
      case "conversation":
        conversationIds.add(parsed.id);
        break;

      case "pod":
        podIds.add(parsed.id);
        break;

      case "user":
        userIds.add(parsed.id);
        break;

      default:
        assertNever(parsed);
    }
  }

  return { conversationIds, podIds, userIds };
}

function hasMount(mounts: FileSystemMount[], scopedPrefix: string): boolean {
  return mounts.some((m) => m.scopedPrefix === scopedPrefix);
}

function assertAllMountsReadable(
  mounts: FileSystemMount[]
): Result<void, DustFileSystemError> {
  for (const mount of mounts) {
    if (!mount.permissions.canRead) {
      return new Err(
        new DustFileSystemError(
          "unauthorized",
          mount.kind === "pod"
            ? "You do not have read access to this pod."
            : `Read access denied for mount: ${mount.scopedPrefix}`
        )
      );
    }
  }

  return new Ok(undefined);
}

// ---------------------------------------------------------------------------
// DustFileSystem
// ---------------------------------------------------------------------------

export class DustFileSystem {
  private constructor(
    private readonly auth: Authenticator,
    private readonly mounts: ReadonlyArray<FileSystemMount>,
    private readonly backend: FileSystemBackend,
    private readonly storageMode: FileSystemStorageMode,
    private readonly sandboxOnlyMounts: ReadonlyArray<SandboxOnlyMount> = []
  ) {}

  private static createBackend(
    auth: Authenticator,
    mounts: ReadonlyArray<FileSystemMount>,
    storageMode: FileSystemStorageMode,
    sandboxOnlyMounts: ReadonlyArray<SandboxOnlyMount> = []
  ): FileSystemBackend {
    if (storageMode === "database") {
      return new DatabaseFileSystemBackend(auth, mounts, sandboxOnlyMounts);
    }

    return new GCSFileSystemBackend(
      auth.getNonNullableWorkspace().sId,
      fileStorageConfig.getGcsPrivateUploadsBucket()
    );
  }

  // --------------------------------------------------------------------------
  // Factories
  // --------------------------------------------------------------------------

  /**
   * Build a DustFileSystem scoped to one or more conversations.
   *
   * Each conversation gets its own read+write mount. When a conversation belongs to a project
   * space, the pod mount is added (deduplicated when multiple conversations share the same space).
   *
   * The first conversation in the list receives the legacy sandbox mount point for backward
   * compatibility. Additional conversations get null legacy paths (they are only used when
   * mounting a sandbox, which is always a single-conversation context).
   */
  static async forConversations(
    auth: Authenticator,
    // TODO(FILE SYSTEM MIGRATION): Ideally, we accept ConversationResource directly.
    conversations: ConversationWithoutContentType[]
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    const mounts: FileSystemMount[] = [];

    // Legacy mount points are only meaningful for sandbox use, which is always single-conversation.
    const includeLegacy = conversations.length === 1;

    for (const conversation of conversations) {
      mounts.push(createConversationMount(conversation, { includeLegacy }));
    }

    // Collect unique pod space IDs, then batch-fetch to avoid N+1 queries.
    const podConversations = conversations.filter(isPodConversation);
    const uniqueSpaceIds = [...new Set(podConversations.map((c) => c.spaceId))];
    const spaces =
      uniqueSpaceIds.length > 0
        ? await SpaceResource.fetchByIds(auth, uniqueSpaceIds)
        : [];
    const spaceById = new Map(spaces.map((space) => [space.sId, space]));

    if (uniqueSpaceIds.length > 0) {
      for (const spaceId of uniqueSpaceIds) {
        const space = spaceById.get(spaceId);
        if (space) {
          mounts.push(createPodMount(auth, space, { includeLegacy: true }));
        }
      }
    }

    const storageModes = new Set<FileSystemStorageMode>();
    for (const conversation of conversations) {
      const pod = isPodConversation(conversation)
        ? spaceById.get(conversation.spaceId)
        : null;
      if (isPodConversation(conversation) && !pod) {
        return new Err(
          new DustFileSystemError(
            "not_found",
            `Pod not found: ${conversation.spaceId}`
          )
        );
      }
      storageModes.add(
        pod
          ? fileSystemStorageModeForPod(pod)
          : fileSystemStorageModeForStandaloneConversation(conversation)
      );
    }
    if (storageModes.size > 1) {
      return new Err(
        new DustFileSystemError(
          "internal",
          "One filesystem cannot mix GCS roots and database-backed roots."
        )
      );
    }
    const storageMode = storageModes.values().next().value ?? "gcs";
    const backend = DustFileSystem.createBackend(auth, mounts, storageMode);

    return new Ok(new DustFileSystem(auth, mounts, backend, storageMode));
  }

  /**
   * Build a DustFileSystem scoped to a single conversation.
   *
   * Always includes the conversation mount. When the conversation belongs to a project space,
   * the pod mount is added with permissions derived from the space's canRead/canWrite checks.
   */
  static async forConversation(
    auth: Authenticator,
    conversation: ConversationWithoutContentType
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    return DustFileSystem.forConversations(auth, [conversation]);
  }

  /**
   * Build a DustFileSystem scoped to a pod (project space).
   * Returns `Err("unauthorized")` when the caller does not have read access to the space.
   */
  static async forPod(
    auth: Authenticator,
    space: SpaceResource,
    // Decided by the caller that owns that concern (the file system only passes them to setup).
    { sandboxOnlyMounts = [] }: { sandboxOnlyMounts?: SandboxOnlyMount[] } = {}
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    if (!auth.can("read", space)) {
      return new Err(
        new DustFileSystemError(
          "unauthorized",
          "You do not have read access to this space."
        )
      );
    }

    const mount = createPodMount(auth, space, { includeLegacy: false });
    const storageMode = fileSystemStorageModeForPod(space);
    const backend = DustFileSystem.createBackend(
      auth,
      [mount],
      storageMode,
      sandboxOnlyMounts
    );

    return new Ok(
      new DustFileSystem(auth, [mount], backend, storageMode, sandboxOnlyMounts)
    );
  }

  /**
   * Build a DustFileSystem for provisioning a pod's sandbox (mount setup and
   * mount credential refresh). Unlike `forPod`, this does not require read
   * access on the space: the sandbox is shared at the pod level and its mounts
   * are identical whoever triggers the boot — in particular an invoker
   * authorized only through app sharing, who holds no read on the Pod. Must
   * only be called from sandbox provisioning paths, never user-facing file
   * APIs; API-level permissions on the mount still derive from the caller, so
   * they fail closed.
   */
  static async forPodSandboxProvisioning(
    auth: Authenticator,
    space: SpaceResource,
    { sandboxOnlyMounts = [] }: { sandboxOnlyMounts?: SandboxOnlyMount[] } = {}
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    const owner = auth.getNonNullableWorkspace();
    if (space.workspaceId !== owner.id) {
      return new Err(
        new DustFileSystemError(
          "unauthorized",
          "The space belongs to another workspace."
        )
      );
    }

    const mount = createPodMount(auth, space, { includeLegacy: false });

    const storageMode = fileSystemStorageModeForPod(space);
    const backend = DustFileSystem.createBackend(
      auth,
      [mount],
      storageMode,
      sandboxOnlyMounts
    );

    return new Ok(
      new DustFileSystem(auth, [mount], backend, storageMode, sandboxOnlyMounts)
    );
  }

  /**
   * Build the publication-only filesystem mounted into a Frame-owned sandbox. Frame artifacts
   * always live in GCS, independently of the storage mode used by the source conversation or Pod.
   * No agent-visible source mount is included.
   */
  static async forFrameSandboxProvisioning(
    auth: Authenticator,
    frame: Pick<FileResource, "sId" | "workspaceId" | "isFrameV2">,
    { sandboxOnlyMounts = [] }: { sandboxOnlyMounts?: SandboxOnlyMount[] } = {}
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    const owner = auth.getNonNullableWorkspace();
    if (frame.workspaceId !== owner.id || !frame.isFrameV2) {
      return new Err(
        new DustFileSystemError(
          "unauthorized",
          "Frame sandbox provisioning requires a Frames v2 resource in this workspace."
        )
      );
    }

    const backend = DustFileSystem.createBackend(
      auth,
      [],
      "gcs",
      sandboxOnlyMounts
    );

    return new Ok(
      new DustFileSystem(auth, [], backend, "gcs", sandboxOnlyMounts)
    );
  }

  /**
   * Build a DustFileSystem scoped to the authenticated user's own memory space.
   *
   * The scope is always `auth.user()` and cannot be overridden, so an agent can never
   * read or write another user's files. Returns `Err("unauthorized")` when there is no
   * authenticated user.
   */
  static async forUser(
    auth: Authenticator
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    const user = auth.user();
    if (!user) {
      return new Err(
        new DustFileSystemError(
          "unauthorized",
          "No authenticated user for the user file system."
        )
      );
    }

    const owner = auth.getNonNullableWorkspace();
    const backend = new GCSFileSystemBackend(
      owner.sId,
      fileStorageConfig.getGcsPrivateUploadsBucket()
    );

    return new Ok(
      new DustFileSystem(auth, [createUserMount(user.sId)], backend, "gcs")
    );
  }

  /**
   * Build a DustFileSystem for an agent loop.
   *
   * Always includes the agent loop conversation mount and, when applicable, its Pod mount
   * (same as {@link forConversation}). Additionally mounts any conversation or Pod referenced
   * in `scopedPaths` that the caller can access, so cross-scope operations (e.g. copy between
   * two conversations) can resolve both endpoints in a single filesystem instance.
   *
   * User-scoped paths are not supported here and trigger an assert, user filesystem is only
   * reachable through forUser.
   */
  static async forAgentLoop(
    auth: Authenticator,
    {
      conversation,
      scopedPaths = [],
    }: {
      conversation: ConversationWithoutContentType;
      scopedPaths?: string[];
    }
  ): Promise<Result<DustFileSystem, DustFileSystemError>> {
    const { conversationIds, podIds, userIds } =
      collectScopedPrefixesFromPaths(scopedPaths);

    assert(
      userIds.size === 0,
      `User-scoped paths are not supported in the agent loop, access user files through DustFileSystem.forUser`
    );

    const additionalConversationIds = [...conversationIds].filter(
      (conversationId) => conversationId !== conversation.sId
    );

    const additionalConversations: ConversationWithoutContentType[] = [];
    if (additionalConversationIds.length > 0) {
      const fetchedConversations = await ConversationResource.fetchByIds(
        auth,
        additionalConversationIds
      );
      const conversationById = new Map(
        fetchedConversations.map((c) => [c.sId, c])
      );

      for (const conversationId of additionalConversationIds) {
        const fetchedConversation = conversationById.get(conversationId);
        if (!fetchedConversation) {
          return new Err(
            new DustFileSystemError(
              "not_found",
              `Conversation not found: ${conversationId}`
            )
          );
        }

        additionalConversations.push(fetchedConversation.toJSON());
      }
    }

    const fsResult = await DustFileSystem.forConversations(auth, [
      conversation,
      ...additionalConversations,
    ]);
    if (fsResult.isErr()) {
      return fsResult;
    }

    const mounts = [...fsResult.value.getMounts()];

    const podIdsToFetch = [...podIds].filter(
      (podId) => !hasMount(mounts, `${SCOPED_PREFIX_POD}${podId}`)
    );

    const additionalSpaces =
      podIdsToFetch.length > 0
        ? await SpaceResource.fetchByIds(auth, podIdsToFetch)
        : [];
    if (podIdsToFetch.length > 0) {
      const spaces = additionalSpaces;
      const spaceById = new Map(spaces.map((s) => [s.sId, s]));

      for (const podId of podIdsToFetch) {
        const space = spaceById.get(podId);
        if (!space) {
          return new Err(
            new DustFileSystemError("not_found", `Space not found: ${podId}`)
          );
        }

        mounts.push(createPodMount(auth, space, { includeLegacy: false }));
      }
    }

    const readableResult = assertAllMountsReadable(mounts);
    if (readableResult.isErr()) {
      return readableResult;
    }

    if (podIdsToFetch.length === 0) {
      return fsResult;
    }

    const addedModes = new Set(
      additionalSpaces.map((space) => fileSystemStorageModeForPod(space))
    );
    addedModes.add(fsResult.value.storageMode);
    if (addedModes.size > 1) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          "One agent loop cannot mount GCS roots and database-backed roots together."
        )
      );
    }

    const storageMode = fsResult.value.storageMode;
    const backend = DustFileSystem.createBackend(auth, mounts, storageMode);

    return new Ok(new DustFileSystem(auth, mounts, backend, storageMode));
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

      case "user": {
        const user = auth.user();
        if (!user || user.sId !== parsed.id) {
          return new Err(
            new DustFileSystemError(
              "unauthorized",
              "You do not have access to this user's file system."
            )
          );
        }
        return DustFileSystem.forUser(auth);
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
    const sanitized = scopedPath.replace(CONTROL_CHAR_RE, "");
    const normalized = path.posix.normalize(sanitized);
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

  isGCSBacked(): boolean {
    return this.storageMode === "gcs";
  }

  checkWriteAccess(scopedPath: string): Result<void, DustFileSystemError> {
    const resolved = this.requireWriteMount(scopedPath);
    return resolved.isErr() ? new Err(resolved.error) : new Ok(undefined);
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

    const encodedPath = entry.path.split("/").map(encodeURIComponent).join("/");

    return (
      `${config.getApiBaseUrl()}/api/w/${workspaceId}` +
      `/files/path/${encodedPath}?thumbnail=1&v=${entry.lastModifiedMs}`
    );
  }

  /**
   * List entries under `scopedPath`.
   * When `scopedPath` is omitted, lists across all readable mounts.
   * Thumbnail URLs are populated here (not in the backend) since they point to our API.
   */
  async list(
    scopedPath?: string,
    opts?: { maxFiles?: number; includeProcessed?: boolean }
  ): Promise<Result<FileSystemEntry[], DustFileSystemError>> {
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
        return new Ok([]);
      }

      const listResult = await this.backend.list(resolved.value.path, opts);
      if (listResult.isErr()) {
        return listResult;
      }

      return new Ok(withThumbnails(listResult.value));
    }

    const results: FileSystemEntry[] = [];
    for (const mount of this.mounts) {
      if (!mount.permissions.canRead) {
        continue;
      }

      const listResult = await this.backend.list(
        `${mount.scopedPrefix}/`,
        opts
      );
      if (listResult.isErr()) {
        return listResult;
      }

      results.push(...withThumbnails(listResult.value));
    }
    return new Ok(results);
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
   * Returns `Ok(null)` when the file does not exist, `Ok(Buffer)` with the full file contents on success.
   * Returns `Err` for path/permission errors (including `legacy_path`) or stream read errors.
   */
  async readBuffer(
    scopedPath: string
  ): Promise<Result<Buffer | null, DustFileSystemError>> {
    const streamResult = await this.read(scopedPath);
    if (streamResult.isErr()) {
      return streamResult;
    }
    if (streamResult.value === null) {
      return new Ok(null);
    }

    const chunks: Buffer[] = [];
    try {
      for await (const chunk of streamResult.value) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    } catch (err) {
      return new Err(
        new DustFileSystemError(
          "internal",
          `Failed to read file content: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }

    return new Ok(Buffer.concat(chunks));
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

  async exists(
    scopedPath: string
  ): Promise<Result<boolean, DustFileSystemError>> {
    const resolved = this.requireReadMount(scopedPath);
    if (resolved.isErr()) {
      return resolved;
    }

    return this.backend.exists(resolved.value.path);
  }

  /**
   * When `content` is a `Readable`, the data is streamed to storage without buffering it in
   * memory; the stream is consumed (or destroyed on error) by the backend.
   */
  async write(
    scopedPath: string,
    content: Buffer | string | Readable,
    contentType: string
  ): Promise<Result<FileSystemNodeIdentity, DustFileSystemError>> {
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

  async mkdir(
    scopedPath: string
  ): Promise<
    Result<
      { entry: FileSystemDirectoryEntry } & FileSystemNodeIdentity,
      DustFileSystemError
    >
  > {
    const resolved = this.requireWriteMount(scopedPath);
    if (resolved.isErr()) {
      return resolved;
    }

    return this.backend.mkdir(resolved.value.path);
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
   * Rename `scopedPath` to `newFileName` within the same directory.
   *
   * `newFileName` must be a plain filename with no path separators.
   * Returns `Ok({ dest, sourceDeletionFailed })` where `dest` is the canonical
   * scoped path of the renamed file. Callers that need to sync side-effects
   * (e.g. FileResource) can use `dest` to determine the new location.
   *
   * No-ops when `newFileName` is identical to the current filename, returning
   * `Ok({ dest: scopedPath, sourceDeletionFailed: false })`.
   */
  async rename(
    scopedPath: string,
    newFileName: string
  ): Promise<
    Result<{ dest: string; sourceDeletionFailed: boolean }, DustFileSystemError>
  > {
    if (
      !newFileName ||
      newFileName.includes("/") ||
      newFileName.includes("\\")
    ) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          "newFileName must be a non-empty string without path separators."
        )
      );
    }

    const lastSlash = scopedPath.lastIndexOf("/");
    const parentDir = lastSlash >= 0 ? scopedPath.slice(0, lastSlash) : "";
    const dest = parentDir ? `${parentDir}/${newFileName}` : newFileName;

    if (dest === scopedPath) {
      return new Ok({ dest, sourceDeletionFailed: false });
    }

    const moveResult = await this.move({ src: scopedPath, dest });
    if (moveResult.isErr()) {
      return moveResult;
    }

    return new Ok({ dest, ...moveResult.value });
  }

  /** Move `src` to `dest` using the selected backend. */
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

    return this.backend.move({
      src: resolvedSrc.value.path,
      dest: resolvedDest.value.path,
    });
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

  /**
   * Translates a canonical scoped path to the raw GCS path stored in
   * `FileResource.mountFilePath`.
   *
   * conversation-{cId}/file.txt → w/{wId}/conversations/{cId}/files/file.txt
   * pod-{pId}/dir/data.csv      → w/{wId}/pods/{pId}/files/dir/data.csv
   *
   * Returns `null` for unrecognised prefixes or paths that have no file component
   * (bare mount roots like `conversation-{cId}`).
   */
  // TODO(FILE SYSTEM MIGRATION): Remove this once FileResource is fully decoupled from the scoped path format.
  toMountFilePath(scopedPath: string): string | null {
    const workspaceId = this.auth.getNonNullableWorkspace().sId;

    if (scopedPath.startsWith(SCOPED_PREFIX_CONVERSATION)) {
      const rest = scopedPath.slice(SCOPED_PREFIX_CONVERSATION.length);
      const slash = rest.indexOf("/");
      if (slash < 0 || slash === rest.length - 1) {
        return null;
      }
      return `w/${workspaceId}/conversations/${rest.slice(0, slash)}/files/${rest.slice(slash + 1)}`;
    }

    if (scopedPath.startsWith(SCOPED_PREFIX_POD)) {
      const rest = scopedPath.slice(SCOPED_PREFIX_POD.length);
      const slash = rest.indexOf("/");
      if (slash < 0 || slash === rest.length - 1) {
        return null;
      }
      return `w/${workspaceId}/pods/${rest.slice(0, slash)}/files/${rest.slice(slash + 1)}`;
    }

    return null;
  }

  /**
   * Translate a canonical scoped path to its absolute path inside a mounted sandbox (the mount's
   * gcsfuse mount point), e.g. `pod-{pId}/greet.ts` -> `/files/pod-{pId}/greet.ts`.
   *
   * Applies the same traversal, mount-membership, and read-permission checks as `read`. Returns
   * `Err("invalid_path")` for a bare mount root (no file component).
   */
  toSandboxPath(scopedPath: string): Result<string, DustFileSystemError> {
    const resolved = this.requireReadMount(scopedPath);
    if (resolved.isErr()) {
      return resolved;
    }

    const { mount, path: normalized } = resolved.value;
    if (mount.sandboxMountPoint === null) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `Scope is not available in the sandbox: ${scopedPath}`
        )
      );
    }
    if (normalized === mount.scopedPrefix) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `Path has no file component: ${scopedPath}`
        )
      );
    }

    const rel = normalized.slice(mount.scopedPrefix.length + 1);
    return new Ok(`${mount.sandboxMountPoint}/${rel}`);
  }

  /** No-ops when the sandbox image does not support the required capability. */
  async setupSandboxMount(
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>> {
    const adapter = this.backend.createSandboxAdapter(
      this.mounts,
      this.sandboxOnlyMounts
    );
    return adapter.setup(this.auth, sandbox, image);
  }

  /** Refresh the storage credential in an already-mounted sandbox. */
  async refreshSandboxMount(
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>> {
    const adapter = this.backend.createSandboxAdapter(
      this.mounts,
      this.sandboxOnlyMounts
    );
    return adapter.refreshCredential(this.auth, sandbox, image);
  }
}
