import {
  type GCSMountPoint,
  moveFile,
} from "@app/lib/api/files/gcs_mount/files";
import {
  getConversationFilesBasePath,
  getProjectFilesBasePath,
  normalizeAndValidateMountRelativeFilePath,
  type ResolveMountFilePathError,
  resolveMoveSourcePath,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

function resolveMountPrefix(auth: Authenticator, scope: GCSMountPoint): string {
  const owner = auth.getNonNullableWorkspace();
  switch (scope.useCase) {
    case "conversation":
      return getConversationFilesBasePath({
        workspaceId: owner.sId,
        conversationId: scope.conversationId,
      });
    case "pod":
      return getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.podId,
      });
    default:
      return assertNever(scope);
  }
}

function defaultDestUseCase(scope: GCSMountPoint): FileUseCase {
  return scope.useCase === "pod" ? "project_context" : "conversation";
}

function defaultDestUseCaseMetadata(scope: GCSMountPoint): FileUseCaseMetadata {
  switch (scope.useCase) {
    case "conversation":
      return { conversationId: scope.conversationId };
    case "pod":
      return { spaceId: scope.podId };
    default:
      return assertNever(scope);
  }
}

/**
 * Move a file within a GCS mount. Source accepts a scoped listing path
 * (`project/foo.pdf`), a mount-relative path (`foo.pdf`), or a full GCS path (`w/...`).
 * Destination is relative to the mount root (no scope prefix).
 */
export async function moveMountFileWithinScope(
  auth: Authenticator,
  scope: GCSMountPoint,
  {
    sourcePath,
    destRelativeFilePath,
  }: {
    sourcePath: string;
    destRelativeFilePath: string;
  }
): Promise<Result<void, ResolveMountFilePathError | Error>> {
  const prefix = resolveMountPrefix(auth, scope);

  const sourceRes = resolveMoveSourcePath({
    sourcePath,
    expectedPrefix: scope.useCase,
    mountBasePath: prefix,
  });
  if (sourceRes.isErr()) {
    return sourceRes;
  }

  const destRes =
    normalizeAndValidateMountRelativeFilePath(destRelativeFilePath);
  if (destRes.isErr()) {
    return destRes;
  }

  const sourceGcsPath = sourceRes.value.normalizedMountFilePath;
  const dest = destRes.value;

  const destGcsPath = `${prefix}${dest}`;
  if (sourceGcsPath === destGcsPath) {
    return new Ok(undefined);
  }

  const destFileName = dest.split("/").pop();
  if (!destFileName) {
    return new Err(new Error("Invalid destination file path."));
  }

  const fileResources = await FileResource.fetchByMountFilePaths(auth, [
    sourceGcsPath,
  ]);
  const file = fileResources[0];

  return moveFile(auth, {
    file,
    sourceGcsPath,
    destScope: scope,
    destRelativeFilePath: dest,
    destFileName,
    destUseCase: file?.useCase ?? defaultDestUseCase(scope),
    destUseCaseMetadata:
      file?.useCaseMetadata ?? defaultDestUseCaseMetadata(scope),
  });
}
