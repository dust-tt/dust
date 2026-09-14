import assert from "node:assert";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import {
  isConversationFileUseCase,
  isSandboxFunctionContentType,
} from "@app/types/files";
import {
  disambiguateFileName,
  getConversationFilesBasePath,
  getPodFilesBasePath,
  getPodSandboxFunctionsBasePath,
} from "@app/types/mount_path";
import { Op, UniqueConstraintError } from "sequelize";

function getMountBasePath(
  auth: Authenticator,
  file: FileResource
): string | null {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const { useCase, useCaseMetadata } = file;
  if (isConversationFileUseCase(useCase) && useCaseMetadata?.conversationId) {
    return getConversationFilesBasePath({
      workspaceId,
      conversationId: useCaseMetadata.conversationId,
    });
  }
  if (useCase === "project_context" && useCaseMetadata?.spaceId) {
    const scope = { workspaceId, podId: useCaseMetadata.spaceId };
    return isSandboxFunctionContentType(file.contentType)
      ? getPodSandboxFunctionsBasePath(scope)
      : getPodFilesBasePath(scope);
  }
  return null;
}

async function claimMountPath(
  file: FileResource,
  mountFilePath: string,
  fallbackPath: string
): Promise<FileResource> {
  const options = {
    where: { id: file.id, workspaceId: file.workspaceId },
    returning: true as const,
  };
  let rows: FileModel[];
  try {
    [, rows] = await FileModel.update({ mountFilePath }, options);
  } catch (err) {
    if (
      !(err instanceof UniqueConstraintError) ||
      mountFilePath === fallbackPath
    ) {
      throw err;
    }
    [, rows] = await FileModel.update({ mountFilePath: fallbackPath }, options);
  }
  assert(rows[0], "File must exist when claiming its mount path");
  return new FileResource(FileModel, rows[0].get());
}

/**
 * @cc [owner:philipperolet,label:backfill] mount-path-claim-before-copy
 * Backfills must claim a workspace-unique mount path before copying content, using the file's
 * sId-disambiguated name on collision. They must not change the file's status or metadata.
 */
/**
 * Backfill entry point for mount path resolution. Reuses an existing path or no-ops when the
 * file's use case isn't mount-eligible. Copies are retried when a path was already claimed.
 */
export async function ensureMountFilePath(
  auth: Authenticator,
  file: FileResource
): Promise<void> {
  assert(
    auth.getNonNullableWorkspace().id === file.workspaceId,
    "Workspace mismatch"
  );
  let mountedFile = file;
  if (!file.mountFilePath) {
    const basePath = getMountBasePath(auth, file);
    if (!basePath) {
      return;
    }
    const desiredPath = `${basePath}${file.fileName}`;
    const fallbackPath = `${basePath}${disambiguateFileName(file)}`;
    // Uses the unique (workspaceId, mountFilePath) index, also enforcing concurrent claims below.
    const existing = await FileModel.findOne({
      attributes: ["id"],
      where: {
        workspaceId: file.workspaceId,
        mountFilePath: desiredPath,
        id: { [Op.ne]: file.id },
      },
    });
    mountedFile = await claimMountPath(
      file,
      existing ? fallbackPath : desiredPath,
      fallbackPath
    );
  }

  assert(
    mountedFile.mountFilePath,
    "File must own a mount path before copying"
  );
  const bucket = getPrivateUploadBucket();
  await bucket.copyFile(
    mountedFile.getCloudStoragePath(auth, "original"),
    mountedFile.mountFilePath
  );
  const processedMountPath = mountedFile.getProcessedMountFilePath();
  if (processedMountPath) {
    await bucket.copyFile(
      mountedFile.getCloudStoragePath(auth, "processed"),
      processedMountPath
    );
  }
}
