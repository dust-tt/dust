import type {
  FileSystemBindingLocation,
  FileSystemFileBinding,
} from "@app/lib/api/file_system/file_binding";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/lib/api/files/mount_path";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

function destination(
  auth: Authenticator,
  file: FileResource,
  location: FileSystemBindingLocation
): {
  mountFilePath: string;
  useCase: FileUseCase;
  useCaseMetadata: FileUseCaseMetadata;
} {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const {
    conversationId: _conversationId,
    spaceId: _spaceId,
    ...preservedMetadata
  } = file.useCaseMetadata ?? {};
  if (location.rootKind === "conversation") {
    return {
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId,
        conversationId: location.rootId,
      })}${location.relativePath}`,
      useCase: "conversation",
      useCaseMetadata: {
        ...preservedMetadata,
        conversationId: location.rootId,
      },
    };
  }
  return {
    mountFilePath: `${getPodFilesBasePath({
      workspaceId,
      podId: location.rootId,
    })}${location.relativePath}`,
    useCase: "project_context",
    useCaseMetadata: { ...preservedMetadata, spaceId: location.rootId },
  };
}

/** The only module where the inode namespace knows about FileResource. */
export class FileResourceFileSystemBinding implements FileSystemFileBinding {
  async resolveFileModelId(
    auth: Authenticator,
    fileResourceId: string
  ): Promise<number | null> {
    return (await FileResource.fetchById(auth, fileResourceId))?.id ?? null;
  }

  async deleteFile(
    auth: Authenticator,
    fileResourceId: string
  ): Promise<Result<void, Error>> {
    const file = await FileResource.fetchById(auth, fileResourceId);
    return file ? file.delete(auth) : new Ok(undefined);
  }

  async moveFile(
    auth: Authenticator,
    fileResourceId: string,
    location: FileSystemBindingLocation
  ): Promise<Result<void, Error>> {
    const file = await FileResource.fetchById(auth, fileResourceId);
    if (!file) {
      // A retry after successful FileResource deletion is only possible for a
      // remove, never a move. Keep rename repair explicit instead of silently
      // detaching a product object.
      return new Err(
        new Error(`FileResource ${fileResourceId} was not found.`)
      );
    }
    const target = destination(auth, file, location);
    await file.updateMount({
      destFileName: location.fileName,
      destMountFilePath: target.mountFilePath,
      destUseCase: target.useCase,
      destUseCaseMetadata: target.useCaseMetadata,
    });
    return new Ok(undefined);
  }
}
