import path from "node:path";

import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import type { GCSMountPoint } from "@app/lib/api/files/gcs_mount/files";
import { emitGCSMountFileMovedAuditLog } from "@app/lib/api/files/gcs_mount/files";
import { withFramePublishLock } from "@app/lib/api/frames/operation_lock";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { UniqueConstraintError } from "sequelize";

const FRAME_SOURCE_MOVE_COPY_CONCURRENCY = 4;
const MAX_FRAME_SOURCE_FILE_COUNT = 1024;
const MAX_FRAME_SOURCE_BYTES = 100 * 1024 * 1024;

type FrameSourceOwner = {
  useCase: FileUseCase;
  useCaseMetadata: Pick<FileUseCaseMetadata, "conversationId" | "spaceId">;
};

export class FrameSourceMoveError extends Error {
  constructor(
    readonly code:
      | "commit_failed"
      | "conflict"
      | "copy_failed"
      | "invalid_source",
    message: string
  ) {
    super(message);
    this.name = "FrameSourceMoveError";
  }
}

export function isFrameSourceMoveError(
  error: unknown
): error is FrameSourceMoveError {
  return error instanceof FrameSourceMoveError;
}

export type MoveFrameV2SourceError = DustFileSystemError | FrameSourceMoveError;

type FrameSourceMove = {
  destinationDirectoryPath: string;
  frameId: string;
  sourceDeletionFailed: boolean;
};

function moveError(code: FrameSourceMoveError["code"], message: string) {
  return new Err(new FrameSourceMoveError(code, message));
}

function sourceOwnerFromPath(path: string): FrameSourceOwner | null {
  const parsed = parseScopedPrefix(path);
  const slash = path.indexOf("/");
  if (!parsed || slash < 0 || slash === path.length - 1) {
    return null;
  }

  switch (parsed.kind) {
    case "conversation":
      return {
        useCase: "conversation",
        useCaseMetadata: { conversationId: parsed.id },
      };
    case "pod":
      return {
        useCase: "project_context",
        useCaseMetadata: { spaceId: parsed.id },
      };
    case "user":
      return null;
  }
}

function isSameOwner(a: FrameSourceOwner, b: FrameSourceOwner): boolean {
  return (
    a.useCase === b.useCase &&
    a.useCaseMetadata.conversationId === b.useCaseMetadata.conversationId &&
    a.useCaseMetadata.spaceId === b.useCaseMetadata.spaceId
  );
}

/**
 * Move a registered Frames v2 source folder within one GCS mount.
 *
 * This intentionally uses a non-transactional copy, DB update, then source delete sequence.
 * A typed copy/commit failure can leave destination objects behind; until the DB update succeeds,
 * the source FileResource path remains authoritative. Once committed, source cleanup is best-effort.
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
  const source = DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  const destination = DustFileSystem.normalizeScopedPath(
    destinationDirectoryPath
  );
  if (!source || !destination) {
    return moveError(
      "invalid_source",
      "Frame source and destination must be scoped paths."
    );
  }
  if (source === destination || destination.startsWith(`${source}/`)) {
    return moveError(
      "invalid_source",
      "Frame source and destination must be different, non-nested folders."
    );
  }

  // Reject cross-mount requests before resolving a filesystem or looking up a FileResource.
  const sourceOwner = sourceOwnerFromPath(source);
  const destinationOwner = sourceOwnerFromPath(destination);
  if (
    !sourceOwner ||
    !destinationOwner ||
    !isSameOwner(sourceOwner, destinationOwner)
  ) {
    return moveError(
      "invalid_source",
      "Frame source and destination must use the same conversation or Pod mount."
    );
  }

  const fsResult = await DustFileSystem.forAgentLoop(auth, {
    conversation,
    scopedPaths: [source, destination],
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
  for (const scopedPath of [source, destination]) {
    const access = dustFs.checkWriteAccess(scopedPath);
    if (access.isErr()) {
      return access;
    }
  }

  const sourceManifestPath = path.posix.join(source, FRAME_MANIFEST_FILE);
  const destinationManifestPath = path.posix.join(
    destination,
    FRAME_MANIFEST_FILE
  );
  const sourceMountPath = dustFs.toMountFilePath(sourceManifestPath);
  const destinationMountPath = dustFs.toMountFilePath(destinationManifestPath);
  if (!sourceMountPath || !destinationMountPath) {
    return moveError("invalid_source", "Invalid Frame source or destination.");
  }

  const [frame] = await FileResource.fetchByMountFilePaths(auth, [
    sourceMountPath,
  ]);
  if (!frame?.isFrameV2) {
    return moveError(
      "invalid_source",
      `No registered Frame found at ${sourceManifestPath}.`
    );
  }

  const locked = await withFramePublishLock<
    FrameSourceMove,
    MoveFrameV2SourceError
  >(frame.sId, async () => {
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (!freshFrame || freshFrame.toScopedPath(auth) !== sourceManifestPath) {
      return moveError(
        "conflict",
        "The Frame source changed while it was being moved; retry from its current path."
      );
    }

    const [registeredDestination] = await FileResource.fetchByMountFilePaths(
      auth,
      [destinationMountPath]
    );
    if (registeredDestination) {
      return moveError(
        "conflict",
        "A registered file already uses the destination path."
      );
    }

    const bucket = getPrivateUploadBucket();
    const sourceMountPrefix = `${path.posix.dirname(sourceMountPath)}/`;
    const destinationMountPrefix = `${path.posix.dirname(destinationMountPath)}/`;
    const destinationExists = await dustFs.exists(destination);
    if (destinationExists.isErr()) {
      return destinationExists;
    }
    let destinationObjects;
    try {
      destinationObjects = await bucket.getFiles({
        prefix: destinationMountPrefix,
        maxResults: 1,
      });
    } catch (error) {
      return moveError(
        "copy_failed",
        `Failed to inspect the Frame destination; the source remains authoritative: ${normalizeError(error).message}`
      );
    }
    if (destinationExists.value || destinationObjects.length > 0) {
      return moveError(
        "conflict",
        "A file or folder already exists at the destination."
      );
    }

    let sourceObjects;
    try {
      sourceObjects = await bucket.getFiles({
        prefix: sourceMountPrefix,
        maxResults: MAX_FRAME_SOURCE_FILE_COUNT + 1,
      });
    } catch (error) {
      return moveError(
        "copy_failed",
        `Failed to inspect the Frame source; the source remains authoritative: ${normalizeError(error).message}`
      );
    }
    if (sourceObjects.length > MAX_FRAME_SOURCE_FILE_COUNT) {
      return moveError(
        "invalid_source",
        "Frame source exceeds the move size or file count limit."
      );
    }
    let sourceSizeBytes = 0;
    for (const sourceObject of sourceObjects) {
      const sizeBytes = Number(sourceObject.metadata.size);
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
        return moveError(
          "invalid_source",
          `Frame source object has invalid size metadata: ${sourceObject.name}`
        );
      }
      sourceSizeBytes += sizeBytes;
    }
    if (sourceSizeBytes > MAX_FRAME_SOURCE_BYTES) {
      return moveError(
        "invalid_source",
        "Frame source exceeds the move size or file count limit."
      );
    }
    if (!sourceObjects.some((entry) => entry.name === sourceMountPath)) {
      return moveError(
        "invalid_source",
        `Frame manifest not found in source folder: ${sourceManifestPath}`
      );
    }
    const registeredSourceFiles = await FileResource.fetchByMountFilePaths(
      auth,
      sourceObjects.map((entry) => entry.name)
    );
    if (registeredSourceFiles.some((file) => file.id !== freshFrame.id)) {
      return moveError(
        "conflict",
        "Move nested registered files separately before moving this Frame."
      );
    }

    const copyResults = await concurrentExecutor(
      sourceObjects,
      async (entry) => {
        if (!entry.name.startsWith(sourceMountPrefix)) {
          return new Err(
            new Error(`Invalid Frame source object path: ${entry.name}`)
          );
        }
        const relativePath = entry.name.slice(sourceMountPrefix.length);
        try {
          await bucket.copyFile(
            entry.name,
            `${destinationMountPrefix}${relativePath}`
          );
          return new Ok(undefined);
        } catch (error) {
          return new Err(normalizeError(error));
        }
      },
      { concurrency: FRAME_SOURCE_MOVE_COPY_CONCURRENCY }
    );
    const copyFailure = copyResults.find((result) => result.isErr());
    if (copyFailure?.isErr()) {
      return moveError(
        "copy_failed",
        `Failed to copy the Frame source; the source remains authoritative and partial destination objects may remain: ${copyFailure.error.message}`
      );
    }

    try {
      await freshFrame.updateMount({
        destFileName: FRAME_MANIFEST_FILE,
        destMountFilePath: destinationMountPath,
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

    let sourceDeletionFailed = false;
    try {
      await bucket.deleteByPrefix(sourceMountPrefix);
    } catch (error) {
      sourceDeletionFailed = true;
      logger.warn(
        {
          destinationDirectoryPath: destination,
          error: normalizeError(error),
          frameId: frame.sId,
          sourceDirectoryPath: source,
        },
        "Frame source moved but the old folder could not be removed"
      );
    }

    const destinationScope: GCSMountPoint =
      destinationOwner.useCase === "conversation"
        ? {
            useCase: "conversation",
            conversationId:
              destinationOwner.useCaseMetadata.conversationId ?? "",
          }
        : {
            useCase: "pod",
            podId: destinationOwner.useCaseMetadata.spaceId ?? "",
          };
    const scopedPrefix = source.split("/", 1)[0];
    const parentRelativePath = path.posix.dirname(
      path.posix.relative(scopedPrefix, destination)
    );
    void emitGCSMountFileMovedAuditLog(auth, destinationScope, {
      relativeFilePath: path.posix.relative(scopedPrefix, source),
      parentRelativePath: parentRelativePath === "." ? "" : parentRelativePath,
    });

    return new Ok({
      destinationDirectoryPath: destination,
      frameId: frame.sId,
      sourceDeletionFailed,
    });
  });

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
