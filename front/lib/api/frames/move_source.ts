import { randomUUID } from "node:crypto";
import path from "node:path";

import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import type { GCSMountPoint } from "@app/lib/api/files/gcs_mount/files";
import { emitGCSMountFileMovedAuditLog } from "@app/lib/api/files/gcs_mount/files";
import { withFrameSourceAndPublishLock } from "@app/lib/api/frames/operation_lock";
import {
  MAX_FRAME_SOURCE_BYTES,
  MAX_FRAME_SOURCE_FILE_COUNT,
} from "@app/lib/api/frames/source_limits";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import {
  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
  getPrivateUploadBucket,
} from "@app/lib/file_storage";
import { isGCSPreconditionFailedError } from "@app/lib/file_storage/types";
import { FileResource } from "@app/lib/resources/file_resource";
import { FrameGoneError } from "@app/lib/resources/frame_sandbox_adapter";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { File, FileMetadata } from "@google-cloud/storage";
import { UniqueConstraintError } from "sequelize";

const FRAME_SOURCE_MOVE_COPY_CONCURRENCY = 4;
const FRAME_SOURCE_MOVE_ID_METADATA_KEY = "dust_frame_source_move_id";

type FrameSourceOwner = {
  useCase: FileUseCase;
  useCaseMetadata: Pick<FileUseCaseMetadata, "conversationId" | "spaceId">;
};

export class FrameSourceMoveError extends Error {
  constructor(
    readonly code: "conflict" | "internal" | "invalid_source",
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

export type MoveFrameV2SourceError =
  | DustFileSystemError
  | FrameGoneError
  | FrameSourceMoveError
  | SandboxFunctionError;

function invalidSource(message: string) {
  return new Err(new FrameSourceMoveError("invalid_source", message));
}

function sourceOwnerFromPath(
  scopedDirectoryPath: string
): FrameSourceOwner | null {
  const parsed = parseScopedPrefix(scopedDirectoryPath);
  const slash = scopedDirectoryPath.indexOf("/");
  if (
    !parsed ||
    slash < 0 ||
    scopedDirectoryPath.slice(slash + 1).length === 0
  ) {
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
    default:
      return assertNever(parsed);
  }
}

function metadataWithoutPendingMove(
  metadata: FileUseCaseMetadata | null
): FileUseCaseMetadata {
  const { pendingFrameSourceMove: _pendingFrameSourceMove, ...stableMetadata } =
    metadata ?? {};
  return stableMetadata;
}

type FrameSourceMoveReservation = NonNullable<
  FileUseCaseMetadata["pendingFrameSourceMove"]
>;

function getMatchingPendingMove(
  frame: FileResource,
  {
    destinationMountFilePath,
    sourceMountFilePath,
  }: {
    destinationMountFilePath: string;
    sourceMountFilePath: string;
  }
): FrameSourceMoveReservation | null {
  const pending = frame.useCaseMetadata?.pendingFrameSourceMove;
  return frame.isFrameV2 &&
    frame.mountFilePath === destinationMountFilePath &&
    pending?.sourceMountFilePath === sourceMountFilePath &&
    pending.destinationMountFilePath === destinationMountFilePath
    ? pending
    : null;
}

function assertFrameAtSource(
  auth: Authenticator,
  frame: FileResource,
  sourceManifestPath: string
): Result<void, FrameSourceMoveError> {
  if (!frame.isFrameV2 || frame.toScopedPath(auth) !== sourceManifestPath) {
    return new Err(
      new FrameSourceMoveError(
        "conflict",
        "The Frame source changed while it was being moved; retry from its current path."
      )
    );
  }
  return new Ok(undefined);
}

function metadataValue(metadata: FileMetadata, key: keyof FileMetadata) {
  const value = metadata[key];
  return value === undefined || value === null ? null : String(value);
}

function isDestinationOwnedByMove(file: File, operationId: string): boolean {
  return (
    file.metadata.metadata?.[FRAME_SOURCE_MOVE_ID_METADATA_KEY] === operationId
  );
}

type GCSObjectGeneration = { filePath: string; generation: string };
type FrameSourceCopy = {
  destinationObjects: GCSObjectGeneration[];
  hasPreexistingDestinationObjects: boolean;
  sourceObjects: GCSObjectGeneration[];
};
type FrameSourceCopyFailure = {
  destinationObjects: GCSObjectGeneration[];
  error: FrameSourceMoveError;
  hasPreexistingDestinationObjects: boolean;
};

async function cleanupDestinationObjects(
  objects: GCSObjectGeneration[]
): Promise<boolean> {
  const bucket = getPrivateUploadBucket();
  try {
    await concurrentExecutor(
      objects,
      ({ filePath, generation }) =>
        bucket.delete(filePath, {
          ignoreNotFound: true,
          ifGenerationMatch: generation,
        }),
      { concurrency: FRAME_SOURCE_MOVE_COPY_CONCURRENCY }
    );
    return true;
  } catch (error) {
    logger.error(
      { error: normalizeError(error) },
      "Failed to clean up a Frame move destination"
    );
    return false;
  }
}

async function deleteCopiedSourceObjects(
  objects: GCSObjectGeneration[],
  sourceMountPrefix: string
): Promise<boolean> {
  const bucket = getPrivateUploadBucket();
  try {
    await concurrentExecutor(
      objects,
      ({ filePath, generation }) =>
        bucket.delete(filePath, {
          ignoreNotFound: true,
          ifGenerationMatch: generation,
        }),
      { concurrency: FRAME_SOURCE_MOVE_COPY_CONCURRENCY }
    );
    const remaining = await bucket.getFiles({
      prefix: sourceMountPrefix,
      maxResults: 1,
    });
    return remaining.length === 0;
  } catch (error) {
    logger.warn(
      { error: normalizeError(error), sourceMountPrefix },
      "Failed to delete copied Frame source object generations"
    );
    return false;
  }
}

async function copyFrameSourceAsNew({
  destinationMountPrefix,
  operationId,
  sourceManifestPath,
  sourceMountPrefix,
}: {
  destinationMountPrefix: string;
  operationId: string;
  sourceManifestPath: string;
  sourceMountPrefix: string;
}): Promise<Result<FrameSourceCopy, FrameSourceCopyFailure>> {
  const bucket = getPrivateUploadBucket();
  const [sourceFiles, destinationFiles] = await Promise.all([
    bucket.getFiles({
      prefix: sourceMountPrefix,
      maxResults: MAX_FRAME_SOURCE_FILE_COUNT + 1,
    }),
    bucket.getFiles({
      prefix: destinationMountPrefix,
      maxResults: MAX_FRAME_SOURCE_FILE_COUNT + 1,
    }),
  ]);
  if (sourceFiles.length === 0) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceMoveError(
        "invalid_source",
        "Frame source folder is empty or no longer exists."
      ),
      hasPreexistingDestinationObjects: destinationFiles.length > 0,
    });
  }
  if (!sourceFiles.some((file) => file.name === sourceManifestPath)) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceMoveError(
        "invalid_source",
        "Frame source manifest is missing."
      ),
      hasPreexistingDestinationObjects: destinationFiles.length > 0,
    });
  }
  const totalSourceSize = sourceFiles.reduce(
    (total, file) => total + Number(file.metadata.size ?? 0),
    0
  );
  if (
    sourceFiles.length > MAX_FRAME_SOURCE_FILE_COUNT ||
    totalSourceSize > MAX_FRAME_SOURCE_BYTES
  ) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceMoveError(
        "invalid_source",
        "Frame source exceeds the move size limit."
      ),
      hasPreexistingDestinationObjects: destinationFiles.length > 0,
    });
  }
  if (destinationFiles.length > MAX_FRAME_SOURCE_FILE_COUNT) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceMoveError(
        "conflict",
        "Frame destination exceeds the move file count limit."
      ),
      hasPreexistingDestinationObjects: true,
    });
  }

  const sourceRelativePaths = new Set(
    sourceFiles.map((file) => file.name.slice(sourceMountPrefix.length))
  );
  const unexpectedDestination = destinationFiles.find(
    (file) =>
      !sourceRelativePaths.has(file.name.slice(destinationMountPrefix.length))
  );
  if (unexpectedDestination) {
    return new Err({
      destinationObjects: [],
      error: new FrameSourceMoveError(
        "conflict",
        `Destination file already exists: ${unexpectedDestination.name.slice(destinationMountPrefix.length)}`
      ),
      hasPreexistingDestinationObjects: true,
    });
  }

  const destinationByRelativePath = new Map(
    destinationFiles.map((file) => [
      file.name.slice(destinationMountPrefix.length),
      file,
    ])
  );
  const copyResults = await concurrentExecutor(
    sourceFiles,
    async (sourceFile) => {
      let hasPreexistingDestinationObject = false;
      try {
        const relativePath = sourceFile.name.slice(sourceMountPrefix.length);
        const destinationPath = `${destinationMountPrefix}${relativePath}`;
        const sourceGeneration = metadataValue(
          sourceFile.metadata,
          "generation"
        );
        if (!sourceGeneration) {
          throw new FrameSourceMoveError(
            "internal",
            `Source generation is missing: ${relativePath}`
          );
        }
        let destinationFile = destinationByRelativePath.get(relativePath);
        let ownedDestinationObject: GCSObjectGeneration | null = null;
        hasPreexistingDestinationObject = Boolean(destinationFile);

        if (!destinationFile) {
          try {
            const copied = await bucket.copyFile(
              sourceFile.name,
              destinationPath,
              undefined,
              {
                destinationGenerationMatch:
                  GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
                destinationMetadata: {
                  ...sourceFile.metadata.metadata,
                  [FRAME_SOURCE_MOVE_ID_METADATA_KEY]: operationId,
                },
                sourceGeneration,
              }
            );
            destinationFile = copied.destinationFile;
            ownedDestinationObject = {
              filePath: destinationPath,
              generation: copied.destinationGeneration,
            };
          } catch (error) {
            if (!isGCSPreconditionFailedError(error)) {
              throw error;
            }
            hasPreexistingDestinationObject = true;
            destinationFile = bucket.file(destinationPath);
            const [metadata] = await destinationFile.getMetadata();
            destinationFile.metadata = metadata;
          }
        }

        if (!ownedDestinationObject) {
          if (!isDestinationOwnedByMove(destinationFile, operationId)) {
            throw new FrameSourceMoveError(
              "conflict",
              `Destination file already exists: ${relativePath}`
            );
          }
          const destinationGeneration = metadataValue(
            destinationFile.metadata,
            "generation"
          );
          if (!destinationGeneration) {
            throw new FrameSourceMoveError(
              "internal",
              `Destination generation is missing: ${relativePath}`
            );
          }
          ownedDestinationObject = {
            filePath: destinationPath,
            generation: destinationGeneration,
          };
        }

        return new Ok<{
          destination: GCSObjectGeneration | null;
          hasPreexistingDestinationObject: boolean;
          source: GCSObjectGeneration;
        }>({
          destination: ownedDestinationObject,
          hasPreexistingDestinationObject,
          source: {
            filePath: sourceFile.name,
            generation: sourceGeneration,
          },
        });
      } catch (error) {
        return new Err({
          error:
            error instanceof FrameSourceMoveError
              ? error
              : new FrameSourceMoveError(
                  "internal",
                  `Failed to copy the Frame source: ${normalizeError(error).message}`
                ),
          hasPreexistingDestinationObject,
        });
      }
    },
    { concurrency: FRAME_SOURCE_MOVE_COPY_CONCURRENCY }
  );
  const copiedObjects = copyResults
    .filter((result) => result.isOk())
    .map((result) => result.value);
  const destinationObjects = copiedObjects.flatMap(({ destination }) =>
    destination ? [destination] : []
  );
  const hasPreexistingDestinationObjects =
    destinationFiles.length > 0 ||
    copyResults.some((result) =>
      result.isOk()
        ? result.value.hasPreexistingDestinationObject
        : result.error.hasPreexistingDestinationObject
    );
  const failedCopy = copyResults.find((result) => result.isErr());
  if (failedCopy?.isErr()) {
    return new Err({
      destinationObjects,
      error: failedCopy.error.error,
      hasPreexistingDestinationObjects,
    });
  }
  return new Ok({
    destinationObjects,
    hasPreexistingDestinationObjects,
    sourceObjects: copiedObjects.map(({ source }) => source),
  });
}

/** Move a registered Frame folder while retaining its stable FileResource identity. */
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
): Promise<
  Result<
    {
      destinationDirectoryPath: string;
      frameId: string;
      sourceDeletionFailed: boolean;
    },
    MoveFrameV2SourceError
  >
> {
  const source = DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  const destination = DustFileSystem.normalizeScopedPath(
    destinationDirectoryPath
  );
  if (!source || !destination) {
    return invalidSource("Frame source and destination must be scoped paths.");
  }
  if (source === destination) {
    return invalidSource("Frame source and destination must be different.");
  }
  if (destination.startsWith(`${source}/`)) {
    return invalidSource(
      "A Frame cannot be moved inside its own source folder."
    );
  }

  const sourceOwner = sourceOwnerFromPath(source);
  const destinationOwner = sourceOwnerFromPath(destination);
  if (!sourceOwner || !destinationOwner) {
    return invalidSource(
      "Frame source and destination must be folders in a conversation or Pod mount."
    );
  }
  if (
    sourceOwner.useCase !== destinationOwner.useCase ||
    sourceOwner.useCaseMetadata.conversationId !==
      destinationOwner.useCaseMetadata.conversationId ||
    sourceOwner.useCaseMetadata.spaceId !==
      destinationOwner.useCaseMetadata.spaceId
  ) {
    return invalidSource(
      "Frame source and destination must use the same conversation or Pod mount."
    );
  }

  // The conversation is the sandbox invocation context. Explicitly requested
  // mounts are still resolved through the authenticated agent-loop filesystem.
  const fsResult = await DustFileSystem.forAgentLoop(auth, {
    conversation,
    scopedPaths: [source, destination],
  });
  if (fsResult.isErr()) {
    return fsResult;
  }
  const dustFs = fsResult.value;
  if (!dustFs.isGCSBacked()) {
    return invalidSource(
      "Frames v2 source moves do not yet support the database-backed filesystem."
    );
  }
  const sourceWriteAccess = dustFs.checkWriteAccess(source);
  if (sourceWriteAccess.isErr()) {
    return sourceWriteAccess;
  }
  const destinationWriteAccess = dustFs.checkWriteAccess(destination);
  if (destinationWriteAccess.isErr()) {
    return destinationWriteAccess;
  }

  const sourceManifestPath = path.posix.join(source, FRAME_MANIFEST_FILE);
  const destinationManifestPath = path.posix.join(
    destination,
    FRAME_MANIFEST_FILE
  );
  const sourceMountPath = dustFs.toMountFilePath(sourceManifestPath);
  const destinationMountPath = dustFs.toMountFilePath(destinationManifestPath);
  if (!sourceMountPath || !destinationMountPath) {
    return invalidSource("Invalid Frame source or destination path.");
  }

  const candidateFrames = await FileResource.fetchByMountFilePaths(auth, [
    sourceMountPath,
    destinationMountPath,
  ]);
  const sourceFrame = candidateFrames.find(
    (candidate) => candidate.mountFilePath === sourceMountPath
  );
  const destinationFrame = candidateFrames.find(
    (candidate) => candidate.mountFilePath === destinationMountPath
  );
  const frame =
    sourceFrame?.isFrameV2 === true
      ? sourceFrame
      : destinationFrame &&
          getMatchingPendingMove(destinationFrame, {
            destinationMountFilePath: destinationMountPath,
            sourceMountFilePath: sourceMountPath,
          })
        ? destinationFrame
        : null;
  if (!frame) {
    return invalidSource(`No registered Frame found at ${sourceManifestPath}.`);
  }

  return withFrameSourceAndPublishLock(frame.sId, async () => {
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (!freshFrame) {
      return new Err(new FrameGoneError(`Frame ${frame.sId} not found.`));
    }
    const reservation = getMatchingPendingMove(freshFrame, {
      destinationMountFilePath: destinationMountPath,
      sourceMountFilePath: sourceMountPath,
    });
    const isRecovery = reservation !== null;
    const operationId = reservation?.operationId ?? randomUUID();
    if (!isRecovery) {
      const sourceCheck = assertFrameAtSource(
        auth,
        freshFrame,
        sourceManifestPath
      );
      if (sourceCheck.isErr()) {
        return sourceCheck;
      }
    }

    const [registeredDestination] = await FileResource.fetchByMountFilePaths(
      auth,
      [destinationMountPath]
    );
    if (registeredDestination && registeredDestination.sId !== freshFrame.sId) {
      return new Err(
        new FrameSourceMoveError(
          "conflict",
          "A registered file already uses the destination path."
        )
      );
    }

    if (!isRecovery) {
      const destinationContents = await dustFs.list(destination, {
        maxFiles: 1,
      });
      if (destinationContents.isErr()) {
        return destinationContents;
      }
      const destinationFileExists = await dustFs.exists(destination);
      if (destinationFileExists.isErr()) {
        return destinationFileExists;
      }
      if (destinationFileExists.value || destinationContents.value.length > 0) {
        return new Err(
          new FrameSourceMoveError(
            "conflict",
            "A file or folder already exists at the destination."
          )
        );
      }
    }

    const originalUseCase = freshFrame.useCase;
    const originalMetadata = metadataWithoutPendingMove(
      freshFrame.useCaseMetadata
    );
    const restoreSourceReservation = async (): Promise<boolean> => {
      try {
        await freshFrame.updateMount({
          destFileName: FRAME_MANIFEST_FILE,
          destMountFilePath: sourceMountPath,
          destUseCase: originalUseCase,
          destUseCaseMetadata: originalMetadata,
        });
        return true;
      } catch (error) {
        logger.error(
          {
            error: normalizeError(error),
            frameId: frame.sId,
            sourceMountPath,
          },
          "Failed to restore a Frame source reservation"
        );
        return false;
      }
    };

    if (!isRecovery) {
      try {
        await freshFrame.updateMount({
          destFileName: FRAME_MANIFEST_FILE,
          destMountFilePath: destinationMountPath,
          destUseCase: originalUseCase,
          destUseCaseMetadata: {
            ...originalMetadata,
            pendingFrameSourceMove: {
              destinationMountFilePath: destinationMountPath,
              operationId,
              sourceMountFilePath: sourceMountPath,
            },
          },
        });
      } catch (error) {
        return new Err(
          new FrameSourceMoveError(
            error instanceof UniqueConstraintError ? "conflict" : "internal",
            error instanceof UniqueConstraintError
              ? "A registered file already uses the destination path."
              : `Failed to reserve the Frame destination: ${normalizeError(error).message}`
          )
        );
      }
    }

    const sourceMountPrefix = `${path.posix.dirname(sourceMountPath)}/`;
    const destinationMountPrefix = `${path.posix.dirname(
      destinationMountPath
    )}/`;
    const copyResult = await copyFrameSourceAsNew({
      destinationMountPrefix,
      operationId,
      sourceManifestPath: sourceMountPath,
      sourceMountPrefix,
    });
    if (copyResult.isErr()) {
      const cleaned = await cleanupDestinationObjects(
        copyResult.error.destinationObjects
      );
      if (!cleaned) {
        return new Err(
          new FrameSourceMoveError(
            "internal",
            "The Frame source copy failed and its destination objects could not be cleaned up; retry the move."
          )
        );
      }
      if (isRecovery && copyResult.error.hasPreexistingDestinationObjects) {
        return new Err(copyResult.error.error);
      }
      const restored = await restoreSourceReservation();
      return restored
        ? new Err(copyResult.error.error)
        : new Err(
            new FrameSourceMoveError(
              "internal",
              "The Frame source copy failed and its destination reservation could not be released."
            )
          );
    }

    const updateFrame = async (
      currentFrame: FileResource
    ): Promise<Result<void, FrameSourceMoveError>> => {
      if (
        !getMatchingPendingMove(currentFrame, {
          destinationMountFilePath: destinationMountPath,
          sourceMountFilePath: sourceMountPath,
        })
      ) {
        return new Err(
          new FrameSourceMoveError(
            "conflict",
            "The Frame source changed while it was being moved; retry from its current path."
          )
        );
      }
      try {
        await currentFrame.updateMount({
          destFileName: FRAME_MANIFEST_FILE,
          destMountFilePath: destinationMountPath,
          destUseCase: originalUseCase,
          destUseCaseMetadata: metadataWithoutPendingMove(
            currentFrame.useCaseMetadata
          ),
        });
        return new Ok(undefined);
      } catch (error) {
        return new Err(
          new FrameSourceMoveError(
            "internal",
            `Failed to update the Frame source location: ${normalizeError(error).message}`
          )
        );
      }
    };

    const updateResult = await updateFrame(freshFrame);

    if (updateResult.isErr()) {
      const cleaned = await cleanupDestinationObjects(
        copyResult.value.destinationObjects
      );
      const restored =
        cleaned &&
        (!isRecovery || !copyResult.value.hasPreexistingDestinationObjects)
          ? await restoreSourceReservation()
          : false;
      if (!restored) {
        logger.error(
          {
            destinationDirectoryPath: destination,
            err: updateResult.error,
            frameId: frame.sId,
            sourceDirectoryPath: source,
          },
          "Frame source move failed and could not be rolled back"
        );
        return new Err(
          new FrameSourceMoveError(
            "internal",
            "The Frame source move failed and could not be rolled back."
          )
        );
      }
      return updateResult;
    }

    const sourceDeleted = await deleteCopiedSourceObjects(
      copyResult.value.sourceObjects,
      sourceMountPrefix
    );
    const sourceDeletionFailed = !sourceDeleted;
    if (sourceDeletionFailed) {
      logger.warn(
        {
          destinationDirectoryPath: destination,
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
    const scopedPrefix =
      sourceOwner.useCase === "conversation"
        ? `conversation-${sourceOwner.useCaseMetadata.conversationId}`
        : `pod-${sourceOwner.useCaseMetadata.spaceId}`;
    const sourceRelativePath = path.posix.relative(scopedPrefix, source);
    const destinationRelativePath = path.posix.relative(
      scopedPrefix,
      destination
    );
    const parentRelativePath = path.posix.dirname(destinationRelativePath);
    void emitGCSMountFileMovedAuditLog(auth, destinationScope, {
      relativeFilePath: sourceRelativePath,
      parentRelativePath: parentRelativePath === "." ? "" : parentRelativePath,
    });

    return new Ok({
      destinationDirectoryPath: destination,
      frameId: frame.sId,
      sourceDeletionFailed,
    });
  });
}
