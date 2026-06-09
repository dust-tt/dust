import { DustFileSystem } from "@app/lib/api/file_system";
import { resolveCanonicalScopedPath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Err, Ok, type Result } from "@app/types/shared/result";

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
): Promise<Result<string | null, Error>> {
  if (pinnedFramePath === null) {
    return new Ok(null);
  }

  const normalizedPath = resolveCanonicalScopedPath(pinnedFramePath, {
    conversationId: null,
    spaceId: space.sId,
  });
  if (!normalizedPath) {
    return new Err(new Error("Invalid pinned frame path."));
  }

  const fsResult = await DustFileSystem.forPod(auth, space);
  if (fsResult.isErr()) {
    return new Err(new Error("Failed to initialize file system."));
  }
  const fs = fsResult.value;

  const statResult = await fs.stat(normalizedPath);
  if (statResult.isErr() || !statResult.value) {
    return new Err(new Error("Pinned frame file not found."));
  }

  return new Ok(normalizedPath);
}
