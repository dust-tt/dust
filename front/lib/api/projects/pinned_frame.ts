import { DustFileSystem } from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { resolveCanonicalScopedPath } from "@app/types/mount_path";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Validate a pinned frame path for a project space and return the canonical scoped path.
 *
 * Accepts the canonical `pod-{spaceId}/...` format and silently normalizes the legacy
 * `project/...` and `pod/...` formats that may still exist in the DB.
 */
export async function validatePinnedFramePath(
  auth: Authenticator,
  space: SpaceResource,
  pinnedFramePath: string | null
): Promise<
  Result<
    string | null,
    DustError<"invalid_request_error" | "internal_error" | "file_not_found">
  >
> {
  if (pinnedFramePath === null) {
    return new Ok(null);
  }

  const normalizedPath = resolveCanonicalScopedPath(pinnedFramePath, {
    conversationId: null,
    spaceId: space.sId,
  });
  if (!normalizedPath) {
    return new Err(
      new DustError("invalid_request_error", "Invalid pinned frame path.")
    );
  }

  const fsResult = await DustFileSystem.forPod(auth, space);
  if (fsResult.isErr()) {
    return new Err(
      new DustError("internal_error", "Failed to initialize file system.")
    );
  }
  const fs = fsResult.value;

  const statResult = await fs.stat(normalizedPath);
  if (statResult.isErr() || !statResult.value) {
    return new Err(
      new DustError("file_not_found", "Pinned frame file not found.")
    );
  }

  return new Ok(normalizedPath);
}
