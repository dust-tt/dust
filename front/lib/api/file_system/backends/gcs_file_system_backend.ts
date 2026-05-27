import type { GCSMountTarget } from "@app/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter";
import { GCSSandboxMountAdapter } from "@app/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter";
import type { SandboxMountAdapter } from "@app/lib/api/file_system/sandbox/sandbox_mount_adapter";
import type {
  FileSystemEntry,
  FileSystemMount,
} from "@app/lib/api/file_system/types";
import {
  DustFileSystemError,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system/types";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import fileStorageConfig from "@app/lib/file_storage/config";
import logger from "@app/logger/logger";
import { stripMimeParameters } from "@app/types/files";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { Readable } from "stream";

import type { FileSystemBackend } from "./file_system_backend";

// ---------------------------------------------------------------------------
// Scoped-path helpers
// ---------------------------------------------------------------------------

type ParsedScopedPath = {
  kind: "conversation" | "pod";
  id: string;
  /** Path component after `<kind>-<id>/`, empty string for a root listing. */
  rel: string;
};

/**
 * Parse the scoped prefix from a scoped path.
 *
 * `"conversation-{cId}/report.pdf"` -> `{ kind: "conversation", id: "{cId}", rel: "report.pdf" }`
 * `"pod-{pId}/data/"`               -> `{ kind: "pod", id: "{pId}", rel: "data/" }`
 *
 * Returns `null` for unrecognised prefixes.
 */
function parseScopedPath(scopedPath: string): ParsedScopedPath | null {
  const slashIdx = scopedPath.indexOf("/");
  const prefix = slashIdx >= 0 ? scopedPath.slice(0, slashIdx) : scopedPath;
  const rel = slashIdx >= 0 ? scopedPath.slice(slashIdx + 1) : "";

  if (prefix.startsWith(SCOPED_PREFIX_CONVERSATION)) {
    const id = prefix.slice(SCOPED_PREFIX_CONVERSATION.length);
    return id ? { kind: "conversation", id, rel } : null;
  }

  if (prefix.startsWith(SCOPED_PREFIX_POD)) {
    const id = prefix.slice(SCOPED_PREFIX_POD.length);
    return id ? { kind: "pod", id, rel } : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// GCSFileSystemBackend
// ---------------------------------------------------------------------------

/** Number of GCS objects fetched per list page. Warn when more than one page is needed. */
const GCS_LIST_PAGE_SIZE = 200;

/**
 * GCS-backed FileSystemBackend.
 *
 * Path translation (internal, never exposed):
 *   `conversation-{cId}/{rel}` -> `w/{wId}/conversations/{cId}/files/{rel}`
 *   `pod-{pId}/{rel}`          -> `w/{wId}/pods/{pId}/files/{rel}`
 */
export class GCSFileSystemBackend implements FileSystemBackend {
  constructor(
    private readonly workspaceId: string,
    private readonly bucketName: string
  ) {}

  private toGCSPath(scopedPath: string): string | null {
    const p = parseScopedPath(scopedPath);
    if (!p) {
      return null;
    }

    switch (p.kind) {
      case "conversation":
        return `w/${this.workspaceId}/conversations/${p.id}/files/${p.rel}`;

      case "pod":
        return `w/${this.workspaceId}/pods/${p.id}/files/${p.rel}`;

      default:
        assertNever(p.kind);
    }
  }

  private fromGCSPath(gcsPath: string): string | null {
    const base = `w/${this.workspaceId}/`;
    if (!gcsPath.startsWith(base)) {
      return null;
    }

    const rest = gcsPath.slice(base.length);
    const conv = rest.match(/^conversations\/([^/]+)\/files\/(.*)$/);
    if (conv) {
      return `${SCOPED_PREFIX_CONVERSATION}${conv[1]}/${conv[2]}`;
    }

    const pod = rest.match(/^pods\/([^/]+)\/files\/(.*)$/);
    if (pod) {
      return `${SCOPED_PREFIX_POD}${pod[1]}/${pod[2]}`;
    }

    return null;
  }

  /** GCS prefix for a mount's root, no trailing slash. Used in CAB and gcsfuse --only-dir. */
  private mountRootGCSPrefix(mount: FileSystemMount): string {
    switch (mount.kind) {
      case "conversation":
        return `w/${this.workspaceId}/conversations/${mount.id}/files`;

      case "pod":
        return `w/${this.workspaceId}/pods/${mount.id}/files`;

      default:
        assertNever(mount.kind);
    }
  }

  async list(
    scopedPath: string,
    {
      maxFiles,
      includeProcessed = false,
    }: { maxFiles?: number; includeProcessed?: boolean } = {}
  ): Promise<FileSystemEntry[]> {
    const normalised = scopedPath.endsWith("/") ? scopedPath : `${scopedPath}/`;
    const gcsPrefix = this.toGCSPath(normalised);

    if (!gcsPrefix) {
      logger.warn(
        { scopedPath, workspaceId: this.workspaceId },
        "GCSFileSystemBackend.list: unrecognised scoped path"
      );

      return [];
    }

    const bucket = getPrivateUploadBucket();
    let rawFiles: { name: string; metadata: Record<string, unknown> }[];

    if (maxFiles !== undefined) {
      rawFiles = await bucket.getFiles({
        prefix: gcsPrefix,
        maxResults: maxFiles,
      });
    } else {
      const result = await bucket.getAllFilesByPrefix({
        prefix: gcsPrefix,
        pageSize: GCS_LIST_PAGE_SIZE,
      });

      if (result.pageFetchCount > 1) {
        logger.warn(
          {
            workspaceId: this.workspaceId,
            prefix: gcsPrefix,
            pageFetchCount: result.pageFetchCount,
            objectCount: result.files.length,
          },
          "GCSFileSystemBackend.list: multiple GCS list requests, prefix has many objects"
        );
      }

      rawFiles = result.files;
    }

    const folderPlaceholders = rawFiles.filter((f) => f.name.endsWith("/"));
    const regularFiles = rawFiles.filter((f) => {
      if (f.name.endsWith("/")) {
        return false;
      }

      if (includeProcessed) {
        return true;
      }

      const name = f.name.split("/").pop() ?? "";
      return !name.includes(".processed.");
    });

    // TODO(FILE SYSTEM MIGRATION): use FileResource.mountFilePath to look up FileResource records
    // here by scoped path to populate fileId.

    const folderEntries: FileSystemEntry[] = folderPlaceholders.flatMap((f) => {
      const trimmed = f.name.replace(/\/$/, "");
      const name = trimmed.split("/").pop() ?? "";
      if (
        !name ||
        (name.startsWith(".") && name !== TOOL_OUTPUTS_FOLDER_NAME)
      ) {
        return [];
      }

      const scopedFilePath = this.fromGCSPath(trimmed);
      if (!scopedFilePath) {
        return [];
      }

      return [
        {
          isDirectory: true as const,
          fileName: name,
          path: scopedFilePath,
          sizeBytes: 0,
          lastModifiedMs: isString(f.metadata["updated"])
            ? new Date(f.metadata["updated"] as string).getTime()
            : 0,
        },
      ];
    });

    const fileEntries: FileSystemEntry[] = regularFiles.map((gcsFile) => {
      const meta = gcsFile.metadata;
      const rawCT = isString(meta["contentType"])
        ? (meta["contentType"] as string)
        : "application/octet-stream";
      const contentType = stripMimeParameters(rawCT);
      const scopedFilePath = this.fromGCSPath(gcsFile.name) ?? gcsFile.name;

      return {
        isDirectory: false as const,
        fileName: gcsFile.name.split("/").pop() ?? gcsFile.name,
        path: scopedFilePath,
        sizeBytes: Number(meta["size"] ?? 0),
        contentType,
        lastModifiedMs: isString(meta["updated"])
          ? new Date(meta["updated"] as string).getTime()
          : 0,
        fileId: null,
        // Thumbnail URLs are application-layer concerns (they point to our API).
        // DustFileSystem.list() populates this after receiving entries from the backend.
        thumbnailUrl: null,
      };
    });

    return [...folderEntries, ...fileEntries];
  }

  async read(
    scopedPath: string
  ): Promise<Result<Readable | null, DustFileSystemError>> {
    const gcsPath = this.toGCSPath(scopedPath);
    if (!gcsPath) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `GCSFileSystemBackend.read: unrecognised scoped path: ${scopedPath}`
        )
      );
    }

    const bucket = getPrivateUploadBucket();
    try {
      const [exists] = await bucket.file(gcsPath).exists();
      if (!exists) {
        return new Ok(null);
      }

      return new Ok(bucket.file(gcsPath).createReadStream());
    } catch (err) {
      return new Err(
        new DustFileSystemError("internal", normalizeError(err).message)
      );
    }
  }

  async stat(
    scopedPath: string
  ): Promise<
    Result<
      { contentType: string; sizeBytes: number } | null,
      DustFileSystemError
    >
  > {
    const gcsPath = this.toGCSPath(scopedPath);
    if (!gcsPath) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `GCSFileSystemBackend.stat: unrecognised scoped path: ${scopedPath}`
        )
      );
    }

    const bucket = getPrivateUploadBucket();
    try {
      const [exists] = await bucket.file(gcsPath).exists();
      if (!exists) {
        return new Ok(null);
      }

      const [metadata] = await bucket.file(gcsPath).getMetadata();
      const rawCT = isString(metadata.contentType)
        ? metadata.contentType
        : "application/octet-stream";

      return new Ok({
        contentType: stripMimeParameters(rawCT),
        sizeBytes: Number(metadata.size ?? 0),
      });
    } catch (err) {
      return new Err(
        new DustFileSystemError("internal", normalizeError(err).message)
      );
    }
  }

  async write(
    scopedPath: string,
    content: Buffer | string,
    contentType: string
  ): Promise<Result<void, DustFileSystemError>> {
    const gcsPath = this.toGCSPath(scopedPath);
    if (!gcsPath) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `GCSFileSystemBackend.write: unrecognised scoped path: ${scopedPath}`
        )
      );
    }

    try {
      const buf = isString(content) ? Buffer.from(content) : content;
      await getPrivateUploadBucket().file(gcsPath).save(buf, { contentType });

      return new Ok(undefined);
    } catch (err) {
      return new Err(
        new DustFileSystemError("internal", normalizeError(err).message)
      );
    }
  }

  async delete(
    scopedPath: string,
    { ignoreNotFound = false }: { ignoreNotFound?: boolean } = {}
  ): Promise<Result<void, DustFileSystemError>> {
    const gcsPath = this.toGCSPath(scopedPath);
    if (!gcsPath) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `GCSFileSystemBackend.delete: unrecognised scoped path: ${scopedPath}`
        )
      );
    }

    try {
      const bucket = getPrivateUploadBucket();
      const [fileExists] = await bucket.file(gcsPath).exists();
      if (fileExists) {
        await bucket.delete(gcsPath, { ignoreNotFound });

        return new Ok(undefined);
      }

      const dirPrefix = gcsPath.endsWith("/") ? gcsPath : `${gcsPath}/`;
      const [dirExists] = await bucket.file(dirPrefix).exists();
      const { files: sample } = await bucket.getAllFilesByPrefix({
        prefix: dirPrefix,
        pageSize: 1,
      });

      if (dirExists || sample.length > 0) {
        await bucket.deleteByPrefix(dirPrefix);
        return new Ok(undefined);
      }

      if (!ignoreNotFound) {
        return new Err(
          new DustFileSystemError("not_found", `Path not found: ${scopedPath}`)
        );
      }

      return new Ok(undefined);
    } catch (err) {
      return new Err(
        new DustFileSystemError("internal", normalizeError(err).message)
      );
    }
  }

  async copy({
    src,
    dest,
  }: {
    src: string;
    dest: string;
  }): Promise<Result<void, DustFileSystemError>> {
    const srcGCS = this.toGCSPath(src);
    const destGCS = this.toGCSPath(dest);
    if (!srcGCS) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `GCSFileSystemBackend.copy: unrecognised source path: ${src}`
        )
      );
    }

    if (!destGCS) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `GCSFileSystemBackend.copy: unrecognised destination path: ${dest}`
        )
      );
    }

    try {
      await getPrivateUploadBucket().copyFile(srcGCS, destGCS);

      return new Ok(undefined);
    } catch (err) {
      return new Err(
        new DustFileSystemError("internal", normalizeError(err).message)
      );
    }
  }

  async getDownloadUrl(
    scopedPath: string,
    _opts?: { expiresInMs?: number; fileName?: string }
  ): Promise<Result<string, DustFileSystemError>> {
    const gcsPath = this.toGCSPath(scopedPath);
    if (!gcsPath) {
      return new Err(
        new DustFileSystemError(
          "invalid_path",
          `GCSFileSystemBackend.getDownloadUrl: unrecognised scoped path: ${scopedPath}`
        )
      );
    }

    try {
      const url = await getPrivateUploadBucket().getSignedUrl(gcsPath);

      return new Ok(url);
    } catch (err) {
      return new Err(
        new DustFileSystemError("internal", normalizeError(err).message)
      );
    }
  }

  createSandboxAdapter(
    mounts: ReadonlyArray<FileSystemMount>
  ): SandboxMountAdapter {
    const bucket = fileStorageConfig.getGcsPrivateUploadsBucket();
    const targets: GCSMountTarget[] = mounts.map((mount) => ({
      gcsPrefix: this.mountRootGCSPrefix(mount),
      sandboxMountPoint: mount.sandboxMountPoint,
      legacySandboxMountPoint: mount.legacySandboxMountPoint,
    }));

    return new GCSSandboxMountAdapter(bucket, targets);
  }
}
