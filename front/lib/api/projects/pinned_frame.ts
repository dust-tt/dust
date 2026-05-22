import { getGCSPathFromScopedPath } from "@app/lib/api/files/gcs_mount/files";
import { getPodFilesBasePath } from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { Err, Ok, type Result } from "@app/types/shared/result";

/**
 * Validate a pinned frame path for a project space.
 * Path must be scoped under `pod/` and resolve to an existing GCS object.
 */
export async function validatePinnedFramePath(
  auth: Authenticator,
  space: SpaceResource,
  pinnedFramePath: string | null
): Promise<Result<string | null, Error>> {
  if (pinnedFramePath === null) {
    return new Ok(null);
  }

  const owner = auth.getNonNullableWorkspace();
  const prefix = getPodFilesBasePath({
    workspaceId: owner.sId,
    podId: space.sId,
  });

  // Some DB rows still carry the legacy `project/` scope prefix; treat them as `pod/`
  // for the existence check so re-submitting an unchanged value doesn't fail validation.
  const normalizedScopedPath = pinnedFramePath.startsWith("project/")
    ? `pod/${pinnedFramePath.slice("project/".length)}`
    : pinnedFramePath;

  const gcsPath = getGCSPathFromScopedPath({
    prefix,
    scopedPath: normalizedScopedPath,
    useCase: "pod",
  });
  if (!gcsPath) {
    return new Err(
      new Error("Path must start with pod/ and be a valid file path.")
    );
  }

  const bucket = getPrivateUploadBucket();
  const contentTypeResult = await bucket.getFileContentType(gcsPath);
  if (contentTypeResult.isErr()) {
    return new Err(new Error("Pinned frame file not found."));
  }

  return new Ok(pinnedFramePath);
}
