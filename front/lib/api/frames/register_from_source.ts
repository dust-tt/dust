import path from "node:path";

import { DustFileSystem } from "@app/lib/api/file_system";
import { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import {
  FRAME_MANIFEST_FILE,
  parseFrameManifest,
} from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import { frameV2ContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { UniqueConstraintError } from "sequelize";

function registrationError(message: string) {
  return new Err(new FramePublicationError("invalid_source", message));
}

function registrationFileSystemError({
  code,
  message,
}: {
  code: string;
  message: string;
}) {
  return new Err(
    new FramePublicationError(
      code === "unauthorized" ? "unauthorized" : "invalid_source",
      message
    )
  );
}

async function existingFrameAtMountPath(
  auth: Authenticator,
  mountFilePath: string,
  fileSize: number
): Promise<Result<FileResource | null, FramePublicationError>> {
  const [existing] = await FileResource.fetchByMountFilePaths(auth, [
    mountFilePath,
  ]);
  if (!existing) {
    return new Ok(null);
  }
  if (!existing.isFrameV2) {
    return registrationError(
      `A non-Frame file is already registered at this path.`
    );
  }

  await existing.update({ fileSize });
  await existing.markAsReady(auth);
  return new Ok(existing);
}

/** Register the manifest already present on the invoking conversation's mounted GCS filesystem. */
export async function registerFrameV2FromSource(
  auth: Authenticator,
  {
    conversation,
    manifestPath,
  }: {
    conversation: ConversationWithoutContentType;
    manifestPath: string;
  }
): Promise<
  Result<{ frame: FileResource; created: boolean }, FramePublicationError>
> {
  const normalizedPath = DustFileSystem.normalizeScopedPath(manifestPath);
  if (
    !normalizedPath ||
    path.posix.basename(normalizedPath) !== FRAME_MANIFEST_FILE
  ) {
    return registrationError(
      `Frame source must point to a ${FRAME_MANIFEST_FILE} file.`
    );
  }

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return registrationFileSystemError(fsResult.error);
  }
  const dustFs = fsResult.value;
  if (!dustFs.isGCSBacked()) {
    return registrationError(
      "Frames v2 registration does not yet support the database-backed filesystem."
    );
  }

  const writeAccess = dustFs.checkWriteAccess(normalizedPath);
  if (writeAccess.isErr()) {
    return registrationFileSystemError(writeAccess.error);
  }

  const manifestBufferResult = await dustFs.readBuffer(normalizedPath);
  if (manifestBufferResult.isErr()) {
    return registrationFileSystemError(manifestBufferResult.error);
  }
  if (manifestBufferResult.value === null) {
    return registrationError(`Frame manifest not found: ${normalizedPath}`);
  }
  const manifestBuffer = manifestBufferResult.value;

  const manifestResult = parseFrameManifest(manifestBuffer);
  if (manifestResult.isErr()) {
    return new Err(
      new FramePublicationError("invalid_manifest", manifestResult.error)
    );
  }

  const mount = dustFs
    .getMounts()
    .find(
      (candidate) =>
        normalizedPath.startsWith(`${candidate.scopedPrefix}/`) &&
        candidate.permissions.canWrite
    );
  if (!mount || (mount.kind !== "conversation" && mount.kind !== "pod")) {
    return registrationError(
      `Frame source does not belong to a writable conversation or Pod mount.`
    );
  }

  const mountFilePath = dustFs.toMountFilePath(normalizedPath);
  if (!mountFilePath) {
    return registrationError(`Invalid Frame source path: ${normalizedPath}`);
  }

  const existingResult = await existingFrameAtMountPath(
    auth,
    mountFilePath,
    manifestBuffer.length
  );
  if (existingResult.isErr()) {
    return existingResult;
  }
  if (existingResult.value) {
    return new Ok({ frame: existingResult.value, created: false });
  }

  const useCase: FileUseCase =
    mount.kind === "pod" ? "project_context" : "conversation";
  const useCaseMetadata: FileUseCaseMetadata =
    mount.kind === "pod" ? { spaceId: mount.id } : { conversationId: mount.id };

  try {
    const frame = await FileResource.makeNew({
      workspaceId: auth.getNonNullableWorkspace().id,
      userId: auth.user()?.id ?? null,
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: manifestBuffer.length,
      useCase,
      useCaseMetadata,
      mountFilePath,
      fileSystemNodeId: null,
    });
    await frame.markAsReady(auth);
    return new Ok({ frame, created: true });
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) {
      throw error;
    }

    const concurrent = await existingFrameAtMountPath(
      auth,
      mountFilePath,
      manifestBuffer.length
    );
    if (concurrent.isErr()) {
      return concurrent;
    }
    assert(concurrent.value, "Frame not found after mount path conflict");
    return new Ok({ frame: concurrent.value, created: false });
  }
}
