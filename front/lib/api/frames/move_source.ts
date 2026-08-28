import path from "node:path";

import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import { withFramePublishLock } from "@app/lib/api/frames/publication_storage";
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
import { normalizeError } from "@app/types/shared/utils/error_utils";

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
    spaceId: _spaceId,
    ...stableMetadata
  } = frame.useCaseMetadata ?? {};
  return {
    ...stableMetadata,
    ...destinationOwner.useCaseMetadata,
  };
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

async function rollbackSourceMove(
  dustFs: DustFileSystem,
  {
    destinationDirectoryPath,
    sourceDeletionFailed,
    sourceDirectoryPath,
  }: {
    destinationDirectoryPath: string;
    sourceDeletionFailed: boolean;
    sourceDirectoryPath: string;
  }
): Promise<Result<void, DustFileSystemError>> {
  if (sourceDeletionFailed) {
    return dustFs.delete(destinationDirectoryPath, { ignoreNotFound: true });
  }

  const rollback = await dustFs.move({
    src: destinationDirectoryPath,
    dest: sourceDirectoryPath,
  });
  return rollback.isErr() ? rollback : new Ok(undefined);
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

  const [frame] = await FileResource.fetchByMountFilePaths(auth, [
    sourceMountPath,
  ]);
  if (!frame?.isFrameV2) {
    return invalidSource(`No registered Frame found at ${sourceManifestPath}.`);
  }

  return withFramePublishLock(frame.sId, async () => {
    const freshFrame = await frame.fetchFreshFrameV2(auth);
    if (!freshFrame) {
      return new Err(new FrameGoneError(`Frame ${frame.sId} not found.`));
    }
    const sourceCheck = assertFrameAtSource(
      auth,
      freshFrame,
      sourceManifestPath
    );
    if (sourceCheck.isErr()) {
      return sourceCheck;
    }

    const [destinationFrame] = await FileResource.fetchByMountFilePaths(auth, [
      destinationMountPath,
    ]);
    if (destinationFrame) {
      return new Err(
        new FrameSourceMoveError(
          "conflict",
          "A registered file already uses the destination path."
        )
      );
    }

    const destinationContents = await dustFs.list(destination, { maxFiles: 1 });
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

    const moveResult = await dustFs.move({
      src: source,
      dest: destination,
    });
    if (moveResult.isErr()) {
      return moveResult;
    }

    const updateFrame = async (
      currentFrame: FileResource
    ): Promise<Result<void, FrameSourceMoveError>> => {
      const currentSourceCheck = assertFrameAtSource(
        auth,
        currentFrame,
        sourceManifestPath
      );
      if (currentSourceCheck.isErr()) {
        return currentSourceCheck;
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
              const check = assertFrameAtSource(
                auth,
                currentFrame,
                sourceManifestPath
              );
              return check.isErr() ? check : new Ok<FileResource>(currentFrame);
            },
            commit: (currentFrame) => updateFrame(currentFrame),
          });

    if (updateResult.isErr()) {
      const rollbackResult = await rollbackSourceMove(dustFs, {
        destinationDirectoryPath: destination,
        sourceDeletionFailed: moveResult.value.sourceDeletionFailed,
        sourceDirectoryPath: source,
      });
      if (rollbackResult.isErr()) {
        logger.error(
          {
            destinationDirectoryPath: destination,
            err: updateResult.error,
            frameId: frame.sId,
            rollbackErr: rollbackResult.error,
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

    if (moveResult.value.sourceDeletionFailed) {
      logger.warn(
        {
          destinationDirectoryPath: destination,
          frameId: frame.sId,
          sourceDirectoryPath: source,
        },
        "Frame source moved but the old folder could not be removed"
      );
    }

    return new Ok({
      destinationDirectoryPath: destination,
      frameId: frame.sId,
      sourceDeletionFailed: moveResult.value.sourceDeletionFailed,
    });
  });
}
