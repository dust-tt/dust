import type { FileSystemEntry, FileSystemMount } from "@app/lib/api/file_system/types";
import type { SandboxMountAdapter } from "@app/lib/api/file_system/sandbox/sandbox_mount_adapter";

export type { FileSystemEntry } from "@app/lib/api/file_system/types";

/**
 * Backend-agnostic file system interface.
 *
 * All paths are scoped paths (`{scopedPrefix}/{relPath}`, e.g. `conversation-{cId}/report.pdf`).
 * Storage-specific translation is a private detail of each concrete backend.
 * A backend instance is workspace-scoped and created once per `DustFileSystem` factory call.
 */
export interface FileSystemBackend {
  /**
   * List entries under `scopedPath` (should end with `/` to list a prefix).
   * Returns an empty array when nothing exists under that path.
   * `.processed.*` siblings are filtered out unless `includeProcessed` is true.
   */
  list(
    scopedPath: string,
    opts?: { maxFiles?: number; includeProcessed?: boolean }
  ): Promise<FileSystemEntry[]>;

  /** Returns `null` when the file does not exist rather than throwing. */
  read(scopedPath: string): Promise<Buffer | null>;

  write(
    scopedPath: string,
    content: Buffer | string,
    contentType: string
  ): Promise<void>;

  /** Throws when the path does not exist unless `ignoreNotFound: true`. */
  delete(
    scopedPath: string,
    opts?: { ignoreNotFound?: boolean }
  ): Promise<void>;

  /** Server-side copy. Does not delete the source. */
  copy(src: string, dest: string): Promise<void>;

  /**
   * Returns a short-lived signed URL for unauthenticated download.
   * `fileName` overrides the Content-Disposition filename hint.
   */
  getDownloadUrl(
    scopedPath: string,
    opts?: { expiresInMs?: number; fileName?: string }
  ): Promise<string>;

  /**
   * Create a sandbox mount adapter for the given mounts.
   * The adapter holds all backend-specific context so callers never see storage paths.
   */
  createSandboxAdapter(
    mounts: ReadonlyArray<FileSystemMount>
  ): SandboxMountAdapter;
}
