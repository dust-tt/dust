import path from "node:path";

import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import type { GCSMountPoint } from "@app/lib/api/files/gcs_mount/files";
import { emitGCSMountFileMovedAuditLog } from "@app/lib/api/files/gcs_mount/files";
import { withFrameSourceAndPublishLock } from "@app/lib/api/frames/operation_lock";
import {
  cleanupFrameSourceCopy,
  copyFrameSourceAsNew,
} from "@app/lib/api/frames/source_copy";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type { FrameScopeTransitionStateError } from "@app/lib/resources/frame_sandbox_adapter";
import {
  FrameGoneError,
  FrameSandboxAdapter,
} from "@app/lib/resources/frame_sandbox_adapter";
import type { ScopeTransitionDestroyError } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { FileUseCase, FileUseCaseMetadata } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { UniqueConstraintError } from "sequelize";

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
  | FrameScopeTransitionStateError
  | FrameSourceMoveError
  | SandboxFunctionError
  | ScopeTransitionDestroyError;

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

async function resolveRuntimeSpaceId(
  auth: Authenticator,
  sourceOwner: FrameSourceOwner
): Promise<Result<string | null, FrameSourceMoveError>> {
  const { conversationId, spaceId } = sourceOwner.useCaseMetadata;
  if (spaceId) {
    return new Ok(spaceId);
  }
  if (!conversationId) {
    return invalidSource("Frame source has no conversation or Pod scope.");
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    return invalidSource(`Conversation ${conversationId} not found.`);
  }
  return new Ok(conversation.spaceSId);
}

function frameMetadataAtDestination(
  frame: FileResource,
  destinationOwner: FrameSourceOwner
): FileUseCaseMetadata {
  const {
    conversationId: _conversationId,
    pendingFrameSourceMove: _pendingFrameSourceMove,
    spaceId: _spaceId,
    ...stableMetadata
  } = frame.useCaseMetadata ?? {};
  return {
    ...stableMetadata,
    ...destinationOwner.useCaseMetadata,
  };
}

function metadataWithoutPendingMove(
  metadata: FileUseCaseMetadata | null
): FileUseCaseMetadata {
  const { pendingFrameSourceMove: _pendingFrameSourceMove, ...stableMetadata } =
    metadata ?? {};
  return stableMetadata;
}

function hasMatchingPendingMove(
  frame: FileResource,
  {
    destinationMountFilePath,
    sourceMountFilePath,
  }: {
    destinationMountFilePath: string;
    sourceMountFilePath: string;
  }
): boolean {
  const pending = frame.useCaseMetadata?.pendingFrameSourceMove;
  return (
    frame.isFrameV2 &&
    frame.mountFilePath === destinationMountFilePath &&
    pending?.sourceMountFilePath === sourceMountFilePath &&
    pending.destinationMountFilePath === destinationMountFilePath
  );
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
          hasMatchingPendingMove(destinationFrame, {
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
    const isRecovery = hasMatchingPendingMove(freshFrame, {
      destinationMountFilePath: destinationMountPath,
      sourceMountFilePath: sourceMountPath,
    });
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

    const [sourceRuntimeSpace, destinationRuntimeSpace] = await Promise.all([
      resolveRuntimeSpaceId(auth, sourceOwner),
      resolveRuntimeSpaceId(auth, destinationOwner),
    ]);
    if (sourceRuntimeSpace.isErr()) {
      return sourceRuntimeSpace;
    }
    if (destinationRuntimeSpace.isErr()) {
      return destinationRuntimeSpace;
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
      allowMatchingDestinationObjects: isRecovery,
      destinationMountPrefix,
      sourceMountPrefix,
    });
    if (copyResult.isErr()) {
      const cleaned = await cleanupFrameSourceCopy(
        copyResult.error.destinationObjects,
        { operation: "move" }
      );
      if (!cleaned) {
        return new Err(
          new FrameSourceMoveError(
            "internal",
            "The Frame source copy failed and its destination objects could not be cleaned up; retry the move."
          )
        );
      }
      const restored = await restoreSourceReservation();
      return restored
        ? new Err(
            new FrameSourceMoveError(
              copyResult.error.error.code,
              copyResult.error.error.message
            )
          )
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
        !hasMatchingPendingMove(currentFrame, {
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
          destUseCase: destinationOwner.useCase,
          destUseCaseMetadata: frameMetadataAtDestination(
            currentFrame,
            destinationOwner
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

    const updateResult =
      sourceRuntimeSpace.value === destinationRuntimeSpace.value
        ? await updateFrame(freshFrame)
        : await FrameSandboxAdapter.withScopeTransition(auth, freshFrame, {
            prepare: async (currentFrame) => {
              return hasMatchingPendingMove(currentFrame, {
                destinationMountFilePath: destinationMountPath,
                sourceMountFilePath: sourceMountPath,
              })
                ? new Ok(undefined)
                : new Err(
                    new FrameSourceMoveError(
                      "conflict",
                      "The Frame source changed while it was being moved; retry from its current path."
                    )
                  );
            },
            commit: (currentFrame) => updateFrame(currentFrame),
          });

    if (updateResult.isErr()) {
      const cleaned = await cleanupFrameSourceCopy(copyResult.value, {
        operation: "move",
      });
      const restored = cleaned ? await restoreSourceReservation() : false;
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

    const sourceDeletion = await dustFs.delete(source, {
      ignoreNotFound: true,
    });
    const sourceDeletionFailed = sourceDeletion.isErr();
    if (sourceDeletionFailed) {
      logger.warn(
        {
          destinationDirectoryPath: destination,
          error: sourceDeletion.error,
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
    const destinationRelativePath = destination.slice(
      destination.indexOf("/") + 1
    );
    const parentRelativePath = path.posix.dirname(destinationRelativePath);
    void emitGCSMountFileMovedAuditLog(auth, destinationScope, {
      relativeFilePath: destinationRelativePath,
      parentRelativePath: parentRelativePath === "." ? "" : parentRelativePath,
    });

    return new Ok({
      destinationDirectoryPath: destination,
      frameId: frame.sId,
      sourceDeletionFailed,
    });
  });
}
