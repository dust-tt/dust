import type { SandboxImage } from "@app/lib/api/sandbox/image/sandbox_image";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { Result } from "@app/types/shared/result";

/**
 * Abstracts storage-backend-specific logic for mounting a file system into a sandbox.
 * Always produced by `FileSystemBackend.createSandboxAdapter(mounts)` so the adapter
 * carries all backend-specific context internally. Callers never touch storage paths.
 */
export interface SandboxMountAdapter {
  /**
   * Full mount sequence: mint credential, write it to the sandbox, start the credential
   * server, create mount directories, run the mount tool for each target, and create
   * backward-compat symlinks.
   *
   * Each adapter decides how to handle an older sandbox image. The database adapter
   * returns an error because an opted-in root must never fall back to GCS.
   */
  setup(
    auth: Authenticator,
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>>;

  /**
   * Refresh the per-mount credentials in an already-mounted sandbox without remounting.
   * The credential broker reads the atomically replaced files on the next request.
   */
  refreshCredential(
    auth: Authenticator,
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>>;
}
