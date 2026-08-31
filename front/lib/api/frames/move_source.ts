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
import {
  isGCSNotFoundError,
  isGCSPreconditionFailedError,
} from "@app/lib/file_storage/types";
import type { LockLeaseGuard } from "@app/lib/lock";
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
const FRAME_SOURCE_MOVE_COPY_MAX_ATTEMPTS = 3;
const FRAME_SOURCE_MOVE_ATTEMPT_ID_METADATA_KEY =
  "dust_frame_source_move_attempt_id";
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

function isSameGCSObject(source: File, destination: File): boolean {
  const sourceMd5 = metadataValue(source.metadata, "md5Hash");
  const destinationMd5 = metadataValue(destination.metadata, "md5Hash");
  if (sourceMd5 && destinationMd5) {
    return sourceMd5 === destinationMd5;
  }

  const sourceCrc32c = metadataValue(source.metadata, "crc32c");
  const destinationCrc32c = metadataValue(destination.metadata, "crc32c");
  const sourceSize = metadataValue(source.metadata, "size");
  const destinationSize = metadataValue(destination.metadata, "size");
  return Boolean(
    sourceCrc32c &&
      destinationCrc32c &&
      sourceSize &&
      destinationSize &&
      sourceCrc32c === destinationCrc32c &&
      sourceSize === destinationSize
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
  preserveReservation: boolean;
};

async function cleanupDestinationObjects(
  objects: GCSObjectGeneration[]
): Promise<boolean> {
  const bucket = getPrivateUploadBucket();
  try {
    const deletionResults = await concurrentExecutor(
      objects,
      async ({ filePath, generation }) => {
        try {
          await bucket.delete(filePath, {
            ignoreNotFound: true,
            ifGenerationMatch: generation,
          });
          return true;
        } catch (error) {
          logger.error(
            { error: normalizeError(error), filePath, generation },
            "Failed to clean up a Frame move destination object"
          );
          return false;
        }
      },
      { concurrency: FRAME_SOURCE_MOVE_COPY_CONCURRENCY }
    );
    return deletionResults.every(Boolean);
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
    const deletionResults = await concurrentExecutor(
      objects,
      async ({ filePath, generation }) => {
        try {
          await bucket.delete(filePath, {
            ignoreNotFound: true,
            ifGenerationMatch: generation,
          });
          return true;
        } catch (error) {
          logger.warn(
            { error: normalizeError(error), filePath, generation },
            "Failed to delete a copied Frame source object generation"
          );
          return false;
        }
      },
      { concurrency: FRAME_SOURCE_MOVE_COPY_CONCURRENCY }
    );
    if (!deletionResults.every(Boolean)) {
      return false;
    }
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
  attemptId,
  destinationMountPrefix,
  operationId,
  sourceManifestPath,
  sourceMountPrefix,
}: {
  attemptId: string;
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
      preserveReservation: false,
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
      preserveReservation: false,
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
      preserveReservation: false,
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
      preserveReservation: false,
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
      preserveReservation: false,
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
      let ownedDestinationObject: GCSObjectGeneration | null = null;
      let preserveReservation = false;
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
        hasPreexistingDestinationObject = Boolean(destinationFile);
        let copyAttempts = 0;
        let lastCopyError: unknown = null;
        const refreshDestination = async (): Promise<File | undefined> => {
          const refreshedDestination = bucket.file(destinationPath);
          try {
            const [metadata] = await refreshedDestination.getMetadata();
            refreshedDestination.metadata = metadata;
            hasPreexistingDestinationObject = true;
            return refreshedDestination;
          } catch (metadataError) {
            if (isGCSNotFoundError(metadataError)) {
              return undefined;
            }
            preserveReservation = true;
            throw new FrameSourceMoveError(
              "internal",
              `Failed to determine whether the Frame destination copy succeeded: ${normalizeError(metadataError).message}`
            );
          }
        };
        const copyMetadata = {
          ...sourceFile.metadata.metadata,
          [FRAME_SOURCE_MOVE_ATTEMPT_ID_METADATA_KEY]: attemptId,
          [FRAME_SOURCE_MOVE_ID_METADATA_KEY]: operationId,
        };

        while (!ownedDestinationObject) {
          if (!destinationFile) {
            if (copyAttempts >= FRAME_SOURCE_MOVE_COPY_MAX_ATTEMPTS) {
              throw (
                lastCopyError ??
                new FrameSourceMoveError(
                  "internal",
                  `Frame destination copy retry limit reached: ${relativePath}`
                )
              );
            }
            copyAttempts++;
            try {
              const copied = await bucket.copyFile(
                sourceFile.name,
                destinationPath,
                undefined,
                {
                  destinationGenerationMatch:
                    GCS_OBJECT_DOES_NOT_EXIST_GENERATION_MATCH,
                  destinationMetadata: copyMetadata,
                  sourceGeneration,
                }
              );
              ownedDestinationObject = {
                filePath: destinationPath,
                generation: copied.destinationGeneration,
              };
              continue;
            } catch (error) {
              lastCopyError = error;
              destinationFile = await refreshDestination();
              if (!destinationFile && !isGCSPreconditionFailedError(error)) {
                throw error;
              }
              continue;
            }
          }

          if (!isDestinationOwnedByMove(destinationFile, operationId)) {
            throw new FrameSourceMoveError(
              "conflict",
              `Destination file already exists: ${relativePath}`
            );
          }
          const observedDestinationGeneration = metadataValue(
            destinationFile.metadata,
            "generation"
          );
          if (!observedDestinationGeneration) {
            preserveReservation = true;
            throw new FrameSourceMoveError(
              "internal",
              `Destination generation is missing: ${relativePath}`
            );
          }
          const destinationMatchesSource = isSameGCSObject(
            sourceFile,
            destinationFile
          );
          if (
            destinationMatchesSource &&
            destinationFile.metadata.metadata?.[
              FRAME_SOURCE_MOVE_ATTEMPT_ID_METADATA_KEY
            ] === attemptId
          ) {
            ownedDestinationObject = {
              filePath: destinationPath,
              generation: observedDestinationGeneration,
            };
            continue;
          }

          if (!destinationMatchesSource) {
            try {
              const liveSource = bucket.file(sourceFile.name);
              const [liveSourceMetadata] = await liveSource.getMetadata();
              if (
                metadataValue(liveSourceMetadata, "generation") !==
                sourceGeneration
              ) {
                preserveReservation = true;
                throw new FrameSourceMoveError(
                  "conflict",
                  `Frame source changed before its stale destination could be refreshed: ${relativePath}`
                );
              }
            } catch (error) {
              if (error instanceof FrameSourceMoveError) {
                throw error;
              }
              preserveReservation = true;
              throw new FrameSourceMoveError(
                "internal",
                `Failed to verify the current Frame source generation: ${normalizeError(error).message}`
              );
            }
          }

          if (copyAttempts >= FRAME_SOURCE_MOVE_COPY_MAX_ATTEMPTS) {
            preserveReservation = true;
            throw new FrameSourceMoveError(
              "internal",
              `Frame destination recopy retry limit reached: ${relativePath}`
            );
          }
          copyAttempts++;
          try {
            const copied = await bucket.copyFile(
              sourceFile.name,
              destinationPath,
              undefined,
              {
                destinationGenerationMatch: observedDestinationGeneration,
                destinationMetadata: copyMetadata,
                sourceGeneration,
              }
            );
            ownedDestinationObject = {
              filePath: destinationPath,
              generation: copied.destinationGeneration,
            };
          } catch (error) {
            lastCopyError = error;
            destinationFile = await refreshDestination();
            if (!destinationFile && !isGCSPreconditionFailedError(error)) {
              throw error;
            }
          }
        }

        return new Ok<{
          destination: GCSObjectGeneration;
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
          preserveReservation,
        });
      }
    },
    { concurrency: FRAME_SOURCE_MOVE_COPY_CONCURRENCY }
  );
  const copiedObjects = copyResults
    .filter((result) => result.isOk())
    .map((result) => result.value);
  const destinationObjects = copiedObjects.map(
    ({ destination }) => destination
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
      preserveReservation: copyResults.some(
        (result) => result.isErr() && result.error.preserveReservation
      ),
    });
  }
  return new Ok({
    destinationObjects,
    hasPreexistingDestinationObjects,
    sourceObjects: copiedObjects.map(({ source }) => source),
  });
}

type FrameSourceMove = {
  destinationDirectoryPath: string;
  frameId: string;
  sourceDeletionFailed: boolean;
};

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
): Promise<Result<FrameSourceMove, MoveFrameV2SourceError>> {
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

  let committedMove: FrameSourceMove | null = null;
  const runLockedMove = async (lease: LockLeaseGuard) => {
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
    const attemptId = randomUUID();
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

    const heldBeforeReservation = lease.check();
    if (heldBeforeReservation.isErr()) {
      return heldBeforeReservation;
    }
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
      attemptId,
      destinationMountPrefix,
      operationId,
      sourceManifestPath: sourceMountPath,
      sourceMountPrefix,
    });
    if (copyResult.isErr()) {
      const heldBeforeCleanup = lease.check();
      if (heldBeforeCleanup.isErr()) {
        return heldBeforeCleanup;
      }
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
      if (
        copyResult.error.preserveReservation ||
        (isRecovery && copyResult.error.hasPreexistingDestinationObjects)
      ) {
        return new Err(copyResult.error.error);
      }
      const heldBeforeRestore = lease.check();
      if (heldBeforeRestore.isErr()) {
        return heldBeforeRestore;
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
    ): Promise<
      Result<
        void,
        { error: FrameSourceMoveError; preserveDestinationObjects: boolean }
      >
    > => {
      const currentReservation = getMatchingPendingMove(currentFrame, {
        destinationMountFilePath: destinationMountPath,
        sourceMountFilePath: sourceMountPath,
      });
      if (currentReservation?.operationId !== operationId) {
        return new Err({
          error: new FrameSourceMoveError(
            "internal",
            "The Frame source changed while its destination update was being committed."
          ),
          preserveDestinationObjects: true,
        });
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
        const updateError = new FrameSourceMoveError(
          "internal",
          `Failed to update the Frame source location: ${normalizeError(error).message}`
        );
        let reconciledFrame: FileResource | null = null;
        try {
          reconciledFrame = await currentFrame.fetchFreshFrameV2(auth);
        } catch (reconciliationError) {
          logger.error(
            {
              error: normalizeError(reconciliationError),
              frameId: currentFrame.sId,
            },
            "Failed to reconcile a Frame destination update"
          );
        }
        if (
          reconciledFrame?.mountFilePath === destinationMountPath &&
          !reconciledFrame.useCaseMetadata?.pendingFrameSourceMove
        ) {
          return new Ok(undefined);
        }
        const reconciledReservation = reconciledFrame
          ? getMatchingPendingMove(reconciledFrame, {
              destinationMountFilePath: destinationMountPath,
              sourceMountFilePath: sourceMountPath,
            })
          : null;
        if (reconciledReservation?.operationId === operationId) {
          return new Err({
            error: updateError,
            preserveDestinationObjects: false,
          });
        }
        return new Err({
          error: new FrameSourceMoveError(
            "internal",
            "The Frame destination update could not be reconciled; retry the move."
          ),
          preserveDestinationObjects: true,
        });
      }
    };

    const heldBeforeUpdate = lease.check();
    if (heldBeforeUpdate.isErr()) {
      return heldBeforeUpdate;
    }
    const updateResult = await updateFrame(freshFrame);

    if (updateResult.isErr()) {
      if (updateResult.error.preserveDestinationObjects) {
        return new Err(updateResult.error.error);
      }
      const heldBeforeCleanup = lease.check();
      if (heldBeforeCleanup.isErr()) {
        return heldBeforeCleanup;
      }
      const cleaned = await cleanupDestinationObjects(
        copyResult.value.destinationObjects
      );
      let restored = false;
      if (
        cleaned &&
        (!isRecovery || !copyResult.value.hasPreexistingDestinationObjects)
      ) {
        const heldBeforeRestore = lease.check();
        if (heldBeforeRestore.isErr()) {
          return heldBeforeRestore;
        }
        restored = await restoreSourceReservation();
      }
      if (!restored) {
        logger.error(
          {
            destinationDirectoryPath: destination,
            err: updateResult.error.error,
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
      return new Err(updateResult.error.error);
    }

    const heldBeforeSourceCleanup = lease.check();
    const sourceDeleted = heldBeforeSourceCleanup.isOk()
      ? await deleteCopiedSourceObjects(
          copyResult.value.sourceObjects,
          sourceMountPrefix
        )
      : false;
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

    committedMove = {
      destinationDirectoryPath: destination,
      frameId: frame.sId,
      sourceDeletionFailed,
    };
    return new Ok(committedMove);
  };
  const lockedMove = await withFrameSourceAndPublishLock(
    frame.sId,
    runLockedMove
  );

  return committedMove ? new Ok(committedMove) : lockedMove;
}
