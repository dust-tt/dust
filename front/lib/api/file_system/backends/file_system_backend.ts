import type { SandboxMountAdapter } from "@app/lib/api/file_system/sandbox/sandbox_mount_adapter";
import type {
  DustFileSystemError,
  FileSystemMount,
} from "@app/lib/api/file_system/types";
import type {
  FileSystemDirectoryEntry,
  FileSystemEntry,
} from "@app/types/api/file_system/types";
import type { Result } from "@app/types/shared/result";
import type { Readable } from "stream";

export type { FileSystemEntry } from "@app/types/api/file_system/types";

/**
 * Backend-agnostic file system interface.
 *
 * All paths are scoped paths (`{scopedPrefix}/{relPath}`, e.g. `conversation-{cId}/report.pdf`).
 * Storage-specific translation is a private detail of each concrete backend.
 * A backend instance is workspace-scoped and created once per `DustFileSystem` factory call.
 *
 * Every method that can fail returns `Result<T, DustFileSystemError>` so callers never need
 * try/catch. The backend owns the catch and maps storage exceptions to the appropriate code.
 */
export interface FileSystemBackend {
  /**
   * List entries under `scopedPath` (should end with `/` to list a prefix).
   * Returns an empty array when nothing exists under that path.
   * `.processed.*` siblings are filtered out unless `includeProcessed` is true.
   * Returns `Err` on storage errors (e.g. network failure).
   */
  list(
    scopedPath: string,
    opts?: { maxFiles?: number; includeProcessed?: boolean }
  ): Promise<Result<FileSystemEntry[], DustFileSystemError>>;

  /**
   * Returns `Ok(null)` when the file does not exist, `Ok(Readable)` on success.
   * The caller is responsible for consuming and destroying the stream.
   * Returns `Err` on path or permission errors.
   */
  read(
    scopedPath: string
  ): Promise<Result<Readable | null, DustFileSystemError>>;

  /**
   * Returns `Ok(null)` when the file does not exist, `Ok(metadata)` on success.
   * Returns `Err` on path or permission errors (including `invalid_path`).
   */
  stat(
    scopedPath: string
  ): Promise<
    Result<
      { contentType: string; sizeBytes: number } | null,
      DustFileSystemError
    >
  >;

  /**
   * Returns `Ok(true)` when a file exists at `scopedPath`, `Ok(false)` otherwise.
   * Unlike `stat`, this never fetches metadata, so it is cheaper for pure existence checks.
   * Returns `Err` on path or permission errors (including `invalid_path`).
   */
  exists(scopedPath: string): Promise<Result<boolean, DustFileSystemError>>;

  /**
   * When `content` is a `Readable`, the data is streamed to storage without buffering it in
   * memory; the stream is consumed (or destroyed on error) by the backend.
   */
  write(
    scopedPath: string,
    content: Buffer | string | Readable,
    contentType: string
  ): Promise<Result<void, DustFileSystemError>>;

  /**
   * Create a directory placeholder at `scopedPath`.
   * Returns `Err("already_exists")` when a directory already exists there.
   */
  mkdir(
    scopedPath: string
  ): Promise<Result<FileSystemDirectoryEntry, DustFileSystemError>>;

  /**
   * Returns `Err("not_found")` when the path does not exist and `ignoreNotFound` is false.
   * Returns `Err("internal")` on unexpected storage errors.
   */
  delete(
    scopedPath: string,
    opts?: { ignoreNotFound?: boolean }
  ): Promise<Result<void, DustFileSystemError>>;

  /** Server-side copy. Does not delete the source. */
  copy({
    src,
    dest,
  }: {
    src: string;
    dest: string;
  }): Promise<Result<void, DustFileSystemError>>;

  /**
   * Returns a short-lived signed URL for unauthenticated download.
   * `fileName` overrides the Content-Disposition filename hint.
   */
  getDownloadUrl(
    scopedPath: string,
    opts?: { expiresInMs?: number; fileName?: string }
  ): Promise<Result<string, DustFileSystemError>>;

  /**
   * Create a sandbox mount adapter for the given mounts.
   * The adapter holds all backend-specific context so callers never see storage paths.
   */
  createSandboxAdapter(
    mounts: ReadonlyArray<FileSystemMount>
  ): SandboxMountAdapter;
}
