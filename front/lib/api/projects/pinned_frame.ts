import {
  DustFileSystem,
  LEGACY_PREFIX_PROJECT,
  SCOPED_PREFIX_POD,
} from "@app/lib/api/file_system";
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

  // Normalize legacy path formats to the canonical pod-{spaceId}/... format.
  let normalizedPath = pinnedFramePath;
  if (pinnedFramePath.startsWith(`${LEGACY_PREFIX_PROJECT}/`)) {
    normalizedPath = `${SCOPED_PREFIX_POD}${space.sId}/${pinnedFramePath.slice(`${LEGACY_PREFIX_PROJECT}/`.length)}`;
  } else if (pinnedFramePath.startsWith("pod/")) {
    normalizedPath = `${SCOPED_PREFIX_POD}${space.sId}/${pinnedFramePath.slice("pod/".length)}`;
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
