import {
  type GCSMountPoint,
  moveFile,
} from "@app/lib/api/files/gcs_mount/files";
import {
  getConversationFilesBasePath,
  getProjectFilesBasePath,
  joinMountRelativePath,
  normalizeMountParentRelativePath,
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
    case "project":
      return getProjectFilesBasePath({
        workspaceId: owner.sId,
        projectId: scope.projectId,
      });
    default:
      return assertNever(scope);
  }
}

function defaultDestUseCase(scope: GCSMountPoint): FileUseCase {
  return scope.useCase === "project" ? "project_context" : "conversation";
}

function defaultDestUseCaseMetadata(scope: GCSMountPoint): FileUseCaseMetadata {
  switch (scope.useCase) {
    case "conversation":
      return { conversationId: scope.conversationId };
    case "project":
      return { spaceId: scope.projectId };
    default:
      return assertNever(scope);
  }
}

/**
 * Move a file within a GCS mount by its path relative to the mount root (no scope prefix).
 * Updates the linked FileResource when one exists at the source path; otherwise GCS only.
 */
export async function moveMountFile(
  auth: Authenticator,
  scope: GCSMountPoint,
  {
    relativeFilePath,
    parentRelativePath,
  }: {
    relativeFilePath: string;
    parentRelativePath?: string;
  }
): Promise<Result<void, Error>> {
  const parentRes = normalizeMountParentRelativePath(parentRelativePath);
  if (parentRes.isErr()) {
    return parentRes;
  }

  const fileName = relativeFilePath.split("/").pop();
  if (!fileName) {
    return new Err(new Error("Invalid file path."));
  }

  const destRelativeFilePath = joinMountRelativePath(parentRes.value, fileName);

  const prefix = resolveMountPrefix(auth, scope);
  const sourceGcsPath = `${prefix}${relativeFilePath}`;
  const destGcsPath = `${prefix}${destRelativeFilePath}`;

  if (sourceGcsPath === destGcsPath) {
    return new Ok(undefined);
  }

  const fileResources = await FileResource.fetchByMountFilePaths(auth, [
    sourceGcsPath,
  ]);
  const file = fileResources[0];

  return moveFile(auth, {
    file,
    sourceGcsPath,
    destScope: scope,
    destRelativeFilePath,
    destFileName: fileName,
    destUseCase: file?.useCase ?? defaultDestUseCase(scope),
    destUseCaseMetadata:
      file?.useCaseMetadata ?? defaultDestUseCaseMetadata(scope),
  });
}
