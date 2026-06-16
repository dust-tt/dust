import { ensureAuthorizedFileAccessForShare } from "@app/lib/api/viz/authorized_file_access";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { AuthorizedFileAccessShareError } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Uploads frame content and refreshes the authorized file access allowlist.
 * Keeps allowlist logic out of FileResource to avoid import cycles.
 */
export async function uploadFrameContent(
  auth: Authenticator,
  file: FileResource,
  content: string
): Promise<Result<void, AuthorizedFileAccessShareError>> {
  await file.uploadContent(auth, content);

  const allowlistResult = await ensureAuthorizedFileAccessForShare(auth, file);
  if (allowlistResult.isErr()) {
    return new Err(allowlistResult.error);
  }

  return new Ok(undefined);
}
