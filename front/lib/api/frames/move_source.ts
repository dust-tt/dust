import { DustFileSystem } from "@app/lib/api/file_system";
import { emitGCSMountFileMovedAuditLog } from "@app/lib/api/files/gcs_mount/files";
import {
  FrameSourceMoveError,
  resolveFrameSourceMovePaths,
} from "@app/lib/api/frames/move_source_paths";
import {
  withFramePublishLock,
  withFrameSourceLock,
} from "@app/lib/api/frames/operation_lock";
import {
  copyFrameSourceStorage,
  deleteFrameSourceStorage,
  inspectFrameSourceStorage,
} from "@app/lib/api/frames/source_storage";
import type { Authenticator } from "@app/lib/auth";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { UniqueConstraintError } from "sequelize";

const moveError = (code: FrameSourceMoveError["code"], message: string) =>
  new Err(new FrameSourceMoveError(code, message));

export type MoveFrameV2SourceError = DustFileSystemError | FrameSourceMoveError;

type FrameSourceMove = {
  destinationDirectoryPath: string;
  frameId: string;
  sourceDeletionFailed: boolean;
};

/**
 * Move a registered Frames v2 source folder within one GCS mount.
 *
 * This intentionally uses a non-transactional copy, DB update, then source delete sequence.
 * Until the DB update succeeds, the source FileResource path remains authoritative.
 */
export async function moveFrameV2Source(
  auth: Authenticator,
  {
    conversation,
    destinationDirectoryPath,
    sourceDirectoryPath,
  }: {
    conversation: ConversationWithoutContentType;
    destinationDirectoryPath: string;
    sourceDirectoryPath: string;
  }
): Promise<Result<FrameSourceMove, MoveFrameV2SourceError>> {
  const pathsResult = resolveFrameSourceMovePaths({
    destinationDirectoryPath,
    sourceDirectoryPath,
  });
  if (pathsResult.isErr()) {
    return pathsResult;
  }
  const paths = pathsResult.value;

  const fsResult = await DustFileSystem.forAgentLoop(auth, {
    conversation,
    scopedPaths: [paths.sourceDirectoryPath, paths.destinationDirectoryPath],
  });
  if (fsResult.isErr()) {
    return fsResult;
  }
  const dustFs = fsResult.value;
  if (!dustFs.isGCSBacked()) {
    return moveError(
      "invalid_source",
      "Frames v2 source moves do not support database-backed mounts."
    );
  }
  for (const scopedPath of [
    paths.sourceDirectoryPath,
    paths.destinationDirectoryPath,
  ]) {
    const access = dustFs.checkWriteAccess(scopedPath);
    if (access.isErr()) {
      return access;
    }
  }

  const sourceMountPath = dustFs.toMountFilePath(paths.sourceManifestPath);
  const destinationMountPath = dustFs.toMountFilePath(
    paths.destinationManifestPath
  );
  if (!sourceMountPath || !destinationMountPath) {
    return moveError("invalid_source", "Invalid Frame source or destination.");
  }

  const [frame] = await FileResource.fetchByMountFilePaths(auth, [
    sourceMountPath,
  ]);
  if (!frame?.isFrameV2) {
    return moveError(
      "invalid_source",
      `No registered Frame found at ${paths.sourceManifestPath}.`
    );
  }

  async function moveWithLocksHeld(
    lockedSourceMountPath: string,
    lockedDestinationMountPath: string
  ) {
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (
      !freshFrame ||
      freshFrame.toScopedPath(auth) !== paths.sourceManifestPath
    ) {
      return moveError(
        "conflict",
        "The Frame source changed while it was being moved; retry from its current path."
      );
    }
    if (freshFrame.useCaseMetadata?.pendingFrameV2Conversion) {
      return moveError(
        "conflict",
        "The Frame has an interrupted conversion; recover it before moving."
      );
    }

    const [registeredDestination] = await FileResource.fetchByMountFilePaths(
      auth,
      [lockedDestinationMountPath]
    );
    if (registeredDestination) {
      return moveError(
        "conflict",
        "A registered file already uses the destination path."
      );
    }

    const snapshot = await inspectFrameSourceStorage({
      destinationMountPath: lockedDestinationMountPath,
      sourceMountPath: lockedSourceMountPath,
    });
    if (snapshot.isErr()) {
      return moveError(snapshot.error.code, snapshot.error.message);
    }
    const registeredSourceFiles = await FileResource.fetchByMountFilePaths(
      auth,
      snapshot.value.sourceObjectNames
    );
    if (registeredSourceFiles.some((file) => file.id !== freshFrame.id)) {
      return moveError(
        "conflict",
        "Move nested registered files separately before moving this Frame."
      );
    }

    const copied = await copyFrameSourceStorage(snapshot.value);
    if (copied.isErr()) {
      return moveError(copied.error.code, copied.error.message);
    }

    try {
      await freshFrame.updateMount({
        destFileName: FRAME_MANIFEST_FILE,
        destMountFilePath: lockedDestinationMountPath,
        destUseCase: freshFrame.useCase,
        destUseCaseMetadata: freshFrame.useCaseMetadata ?? undefined,
      });
    } catch (error) {
      const normalized = normalizeError(error);
      return moveError(
        error instanceof UniqueConstraintError ? "conflict" : "commit_failed",
        error instanceof UniqueConstraintError
          ? "A registered file already uses the destination path."
          : `Failed to commit the Frame source move; the source remains authoritative and destination objects may remain: ${normalized.message}`
      );
    }

    const deleted = await deleteFrameSourceStorage(
      snapshot.value.sourceMountPrefix
    );
    if (deleted.isErr()) {
      logger.warn(
        {
          destinationDirectoryPath: paths.destinationDirectoryPath,
          error: deleted.error,
          frameId: frame.sId,
          sourceDirectoryPath: paths.sourceDirectoryPath,
        },
        "Frame source moved but the old folder could not be removed"
      );
    }

    void emitGCSMountFileMovedAuditLog(auth, paths.destinationScope, {
      relativeFilePath: paths.auditEvent.relativeFilePath,
      parentRelativePath: paths.auditEvent.parentRelativePath,
    });

    return new Ok({
      destinationDirectoryPath: paths.destinationDirectoryPath,
      frameId: frame.sId,
      sourceDeletionFailed: deleted.isErr(),
    });
  }

  const locked = await withFrameSourceLock(frame.sId, () =>
    withFramePublishLock(frame.sId, () =>
      moveWithLocksHeld(sourceMountPath, destinationMountPath)
    )
  );

  if (locked.isErr()) {
    return isLockAcquisitionTimeoutError(locked.error)
      ? moveError(
          "conflict",
          "Another Frame operation is in progress; retry the move."
        )
      : new Err(locked.error);
  }
  return locked;
}
