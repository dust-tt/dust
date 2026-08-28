import path from "node:path";

import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import type { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import { withFrameSourceAndPublishLock } from "@app/lib/api/frames/publication_storage";
import { publishFrameV2FromSource } from "@app/lib/api/frames/publish_from_source";
import { registerFrameV2FromSource } from "@app/lib/api/frames/register_from_source";
import {
  cleanupFrameSourceCopy,
  copyFrameSourceAsNew,
} from "@app/lib/api/frames/source_copy";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export class FrameSourceCloneError extends Error {
  constructor(
    readonly code: "conflict" | "internal" | "invalid_source",
    message: string
  ) {
    super(message);
    this.name = "FrameSourceCloneError";
  }
}

export function isFrameSourceCloneError(
  error: unknown
): error is FrameSourceCloneError {
  return error instanceof FrameSourceCloneError;
}

export type CloneFrameV2SourceError =
  | DustFileSystemError
  | FramePublicationError
  | FrameSourceCloneError
  | SandboxFunctionError;

export type CloneFrameV2SourceResult = {
  destinationDirectoryPath: string;
  frameId: string;
  publicationId: string;
  sourceDirectoryPath: string;
};

function cloneError(
  code: FrameSourceCloneError["code"],
  message: string
): Err<FrameSourceCloneError> {
  return new Err(new FrameSourceCloneError(code, message));
}

function isFrameDirectoryPath(scopedPath: string): boolean {
  const parsed = parseScopedPrefix(scopedPath);
  const slash = scopedPath.indexOf("/");
  return Boolean(
    parsed &&
      (parsed.kind === "conversation" || parsed.kind === "pod") &&
      slash >= 0 &&
      scopedPath.slice(slash + 1).length > 0
  );
}

/** Clone a registered Frame package into a fresh identity and publication. */
export async function cloneFrameV2Source(
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
): Promise<Result<CloneFrameV2SourceResult, CloneFrameV2SourceError>> {
  const source = DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  const destination = DustFileSystem.normalizeScopedPath(
    destinationDirectoryPath
  );
  if (
    !source ||
    !destination ||
    !isFrameDirectoryPath(source) ||
    !isFrameDirectoryPath(destination)
  ) {
    return cloneError(
      "invalid_source",
      "Frame source and destination must be folders in a conversation or Pod mount."
    );
  }
  if (source === destination) {
    return cloneError(
      "invalid_source",
      "Frame source and destination must be different."
    );
  }
  if (destination.startsWith(`${source}/`)) {
    return cloneError(
      "invalid_source",
      "A Frame cannot be cloned inside its own source folder."
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
    return cloneError(
      "invalid_source",
      "Frames v2 source clones do not yet support the database-backed filesystem."
    );
  }

  const destinationWriteAccess = dustFs.checkWriteAccess(destination);
  if (destinationWriteAccess.isErr()) {
    return new Err(destinationWriteAccess.error);
  }
  const sourceListing = await dustFs.list(source, { maxFiles: 1 });
  if (sourceListing.isErr()) {
    return new Err(sourceListing.error);
  }

  const sourceManifestPath = path.posix.join(source, FRAME_MANIFEST_FILE);
  const destinationManifestPath = path.posix.join(
    destination,
    FRAME_MANIFEST_FILE
  );
  const sourceMountPath = dustFs.toMountFilePath(sourceManifestPath);
  const destinationMountPath = dustFs.toMountFilePath(destinationManifestPath);
  if (!sourceMountPath || !destinationMountPath) {
    return cloneError(
      "invalid_source",
      "Invalid Frame source or destination path."
    );
  }

  const candidates = await FileResource.fetchByMountFilePaths(auth, [
    sourceMountPath,
    destinationMountPath,
  ]);
  const sourceFrame = candidates.find(
    (candidate) => candidate.mountFilePath === sourceMountPath
  );
  if (!sourceFrame?.isFrameV2) {
    return cloneError(
      "invalid_source",
      `No registered Frames v2 package found at ${source}.`
    );
  }
  if (
    candidates.some(
      (candidate) => candidate.mountFilePath === destinationMountPath
    )
  ) {
    return cloneError(
      "conflict",
      "A registered file already uses the destination path."
    );
  }

  return withFrameSourceAndPublishLock<
    CloneFrameV2SourceResult,
    CloneFrameV2SourceError
  >(sourceFrame.sId, async () => {
    const freshSource = await FileResource.fetchById(auth, sourceFrame.sId);
    if (
      !freshSource?.isFrameV2 ||
      freshSource.toScopedPath(auth) !== sourceManifestPath
    ) {
      return cloneError(
        "conflict",
        "The Frame source changed while it was being cloned; retry from its current path."
      );
    }

    const [registeredDestination] = await FileResource.fetchByMountFilePaths(
      auth,
      [destinationMountPath]
    );
    if (registeredDestination) {
      return cloneError(
        "conflict",
        "A registered file already uses the destination path."
      );
    }
    const destinationContents = await dustFs.list(destination, { maxFiles: 1 });
    if (destinationContents.isErr()) {
      return new Err(destinationContents.error);
    }
    const destinationExists = await dustFs.exists(destination);
    if (destinationExists.isErr()) {
      return new Err(destinationExists.error);
    }
    if (destinationExists.value || destinationContents.value.length > 0) {
      return cloneError(
        "conflict",
        "A file or folder already exists at the destination."
      );
    }

    const copyResult = await copyFrameSourceAsNew({
      allowMatchingDestinationObjects: false,
      destinationMountPrefix: `${path.posix.dirname(destinationMountPath)}/`,
      makeError: (code, message) => new FrameSourceCloneError(code, message),
      sourceMountPrefix: `${path.posix.dirname(sourceMountPath)}/`,
    });
    if (copyResult.isErr()) {
      const cleaned = await cleanupFrameSourceCopy(
        copyResult.error.destinationObjects,
        { operation: "clone" }
      );
      return cleaned
        ? new Err(copyResult.error.error)
        : cloneError(
            "internal",
            "The Frame source copy failed and its destination objects could not be cleaned up."
          );
    }

    const registration = await registerFrameV2FromSource(auth, {
      conversation,
      manifestPath: destinationManifestPath,
    });
    if (registration.isErr()) {
      const cleaned = await cleanupFrameSourceCopy(copyResult.value, {
        operation: "clone",
      });
      if (!cleaned) {
        return cloneError(
          "internal",
          "The Frame clone could not be registered or cleaned up."
        );
      }
      return new Err(registration.error);
    }
    if (!registration.value.created) {
      return cloneError(
        "conflict",
        "A registered Frame already uses the destination path."
      );
    }

    const clonedFrame = registration.value.frame;
    const publication = await publishFrameV2FromSource(auth, {
      conversation,
      frame: clonedFrame,
      manifestPath: destinationManifestPath,
    });
    if (publication.isErr()) {
      const sourceCleaned = await cleanupFrameSourceCopy(copyResult.value, {
        operation: "clone",
      });
      const resourceCleanup = sourceCleaned
        ? await clonedFrame.delete(auth)
        : null;
      if (!sourceCleaned || resourceCleanup?.isErr()) {
        logger.error(
          {
            destinationDirectoryPath: destination,
            frameId: clonedFrame.sId,
            publicationError: publication.error,
            resourceCleanupError: resourceCleanup?.isErr()
              ? resourceCleanup.error
              : null,
            sourceDirectoryPath: source,
            workspaceId: auth.getNonNullableWorkspace().sId,
          },
          "Failed to roll back a Frame clone"
        );
        return cloneError(
          "internal",
          "Frame publication failed and the partial clone could not be cleaned up."
        );
      }
      return new Err(publication.error);
    }

    logger.info(
      {
        destinationDirectoryPath: destination,
        frameId: clonedFrame.sId,
        publicationId: publication.value.publicationId,
        sourceDirectoryPath: source,
        sourceFrameId: freshSource.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Cloned Frame v2"
    );

    return new Ok({
      destinationDirectoryPath: destination,
      frameId: clonedFrame.sId,
      publicationId: publication.value.publicationId,
      sourceDirectoryPath: source,
    });
  });
}
