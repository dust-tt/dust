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
   * Returns `Ok(undefined)` when the image does not support the required capability.
   */
  setup(
    auth: Authenticator,
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>>;

  /**
   * Refresh the credential in an already-mounted sandbox without remounting.
   * Overwrites the credential file that the credential server reads on the next request.
   */
  refreshCredential(
    auth: Authenticator,
    sandbox: SandboxResource,
    image: SandboxImage
  ): Promise<Result<void, Error>>;
}
