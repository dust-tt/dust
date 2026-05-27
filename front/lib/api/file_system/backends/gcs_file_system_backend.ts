import config from "@app/lib/api/config";
import type { GCSMountTarget } from "@app/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter";
import { GCSSandboxMountAdapter } from "@app/lib/api/file_system/sandbox/gcs_sandbox_mount_adapter";
import type { SandboxMountAdapter } from "@app/lib/api/file_system/sandbox/sandbox_mount_adapter";
import type {
  FileSystemEntry,
  FileSystemMount,
} from "@app/lib/api/file_system/types";
import { TOOL_OUTPUTS_FOLDER_NAME } from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import fileStorageConfig from "@app/lib/file_storage/config";
import logger from "@app/logger/logger";
import {
  isSupportedImageContentType,
  stripMimeParameters,
} from "@app/types/files";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";

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

  if (prefix.startsWith("conversation-")) {
    const id = prefix.slice("conversation-".length);
    return id ? { kind: "conversation", id, rel } : null;
  }
  if (prefix.startsWith("pod-")) {
    const id = prefix.slice("pod-".length);
    return id ? { kind: "pod", id, rel } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GCSFileSystemBackend
// ---------------------------------------------------------------------------

/**
 * GCS-backed FileSystemBackend.
 *
 * Path translation (internal, never exposed):
 *   `conversation-{cId}/{rel}` -> `w/{wId}/conversations/{cId}/files/{rel}`
 *   `pod-{pId}/{rel}`          -> `w/{wId}/pods/{pId}/files/{rel}`
 *
 * `fileId` is always null in listing entries until the DB migration converts
 * `FileResource.mountFilePath` from raw GCS paths to scoped paths.
 * See TODO(FILE SYSTEM MIGRATION) in `list`.
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
      return `conversation-${conv[1]}/${conv[2]}`;
    }
    const pod = rest.match(/^pods\/([^/]+)\/files\/(.*)$/);
    if (pod) {
      return `pod-${pod[1]}/${pod[2]}`;
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
        pageSize: 200,
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

    // TODO(FILE SYSTEM MIGRATION): once FileResource.mountFilePath stores scoped paths,
    // look up FileResource records here by scoped path to populate fileId.

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
        thumbnailUrl: this.buildThumbnailUrl(contentType, scopedFilePath),
      };
    });

    return [...folderEntries, ...fileEntries];
  }

  private buildThumbnailUrl(
    contentType: string,
    scopedFilePath: string
  ): string | null {
    if (!isSupportedImageContentType(contentType)) {
      return null;
    }
    const parsed = parseScopedPath(scopedFilePath);
    if (!parsed) {
      return null;
    }
    switch (parsed.kind) {
      case "conversation":
        return (
          `${config.getApiBaseUrl()}/api/w/${this.workspaceId}` +
          `/assistant/conversations/${parsed.id}/files/thumbnail` +
          `?filePath=${encodeURIComponent(scopedFilePath)}`
        );
      case "pod":
        // TODO(FILE SYSTEM): expose a pod-files thumbnail endpoint.
        return null;
    }
  }

  async read(scopedPath: string): Promise<Buffer | null> {
    const gcsPath = this.toGCSPath(scopedPath);
    if (!gcsPath) {
      logger.warn(
        { scopedPath, workspaceId: this.workspaceId },
        "GCSFileSystemBackend.read: unrecognised scoped path"
      );
      return null;
    }
    const bucket = getPrivateUploadBucket();
    try {
      const [exists] = await bucket.file(gcsPath).exists();
      if (!exists) {
        return null;
      }
      const [content] = await bucket.file(gcsPath).download();
      return content;
    } catch (err) {
      logger.error(
        { err: normalizeError(err), gcsPath, workspaceId: this.workspaceId },
        "GCSFileSystemBackend.read: download failed"
      );
      return null;
    }
  }

  async write(
    scopedPath: string,
    content: Buffer | string,
    contentType: string
  ): Promise<void> {
    const gcsPath = this.toGCSPath(scopedPath);
    if (!gcsPath) {
      throw new Error(
        `GCSFileSystemBackend.write: unrecognised scoped path: ${scopedPath}`
      );
    }
    const buf = typeof content === "string" ? Buffer.from(content) : content;
    await getPrivateUploadBucket().file(gcsPath).save(buf, { contentType });
  }

  async delete(
    scopedPath: string,
    { ignoreNotFound = false }: { ignoreNotFound?: boolean } = {}
  ): Promise<void> {
    const gcsPath = this.toGCSPath(scopedPath);
    if (!gcsPath) {
      if (ignoreNotFound) {
        return;
      }
      throw new Error(
        `GCSFileSystemBackend.delete: unrecognised scoped path: ${scopedPath}`
      );
    }

    const bucket = getPrivateUploadBucket();
    const [fileExists] = await bucket.file(gcsPath).exists();
    if (fileExists) {
      await bucket.delete(gcsPath, { ignoreNotFound });
      return;
    }

    const dirPrefix = gcsPath.endsWith("/") ? gcsPath : `${gcsPath}/`;
    const [dirExists] = await bucket.file(dirPrefix).exists();
    const { files: sample } = await bucket.getAllFilesByPrefix({
      prefix: dirPrefix,
      pageSize: 1,
    });

    if (dirExists || sample.length > 0) {
      await bucket.deleteByPrefix(dirPrefix);
      return;
    }

    if (!ignoreNotFound) {
      throw new Error(
        `GCSFileSystemBackend.delete: path not found: ${scopedPath}`
      );
    }
  }

  async copy(src: string, dest: string): Promise<void> {
    const srcGCS = this.toGCSPath(src);
    const destGCS = this.toGCSPath(dest);
    if (!srcGCS) {
      throw new Error(
        `GCSFileSystemBackend.copy: unrecognised source path: ${src}`
      );
    }
    if (!destGCS) {
      throw new Error(
        `GCSFileSystemBackend.copy: unrecognised destination path: ${dest}`
      );
    }
    await getPrivateUploadBucket().copyFile(srcGCS, destGCS);
  }

  async getDownloadUrl(
    scopedPath: string,
    _opts?: { expiresInMs?: number; fileName?: string }
  ): Promise<string> {
    const gcsPath = this.toGCSPath(scopedPath);
    if (!gcsPath) {
      throw new Error(
        `GCSFileSystemBackend.getDownloadUrl: unrecognised scoped path: ${scopedPath}`
      );
    }
    return getPrivateUploadBucket().getSignedUrl(gcsPath);
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
