import path from "node:path";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { DustFileSystem, parseScopedPrefix } from "@app/lib/api/file_system";
import {
  withFrameSourceLock,
  withFrameWorkspaceSourceLock,
} from "@app/lib/api/frames/operation_lock";
import type { FramePublicationError } from "@app/lib/api/frames/publication_storage";
import { publishFrameV2FromSource } from "@app/lib/api/frames/publish_from_source";
import { registerFrameV2FromSourceUsingFileSystem } from "@app/lib/api/frames/register_from_source";
import type { FrameSourceStorageError } from "@app/lib/api/frames/source_storage";
import {
  copyFrameSourceStorage,
  inspectFrameSourceStorage,
} from "@app/lib/api/frames/source_storage";
import type { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import type { LockAcquisitionTimeoutError } from "@app/lib/lock";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { DustFileSystemError } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export class FrameSourceCloneError extends Error {
  constructor(
    readonly code: "conflict" | "invalid_source",
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

function cloneStorageError(error: FrameSourceStorageError) {
  return error.code === "copy_failed"
    ? new Err(new DustFileSystemError("internal", error.message))
    : cloneError(error.code, error.message);
}

function isFrameDirectoryPath(scopedPath: string): boolean {
  const prefix = parseScopedPrefix(scopedPath);
  const slash = scopedPath.indexOf("/");
  return Boolean(
    prefix &&
      (prefix.kind === "conversation" || prefix.kind === "pod") &&
      slash >= 0 &&
      scopedPath.slice(slash + 1).length > 0
  );
}

/** Clone a registered Frames v2 package into a fresh identity and publication. */
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
  const owner = auth.getNonNullableWorkspace();
  if (source === destination || destination.startsWith(`${source}/`)) {
    return cloneError(
      "invalid_source",
      "A Frame must be cloned to a different folder outside its source."
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
      "Frames v2 clones do not yet support the database-backed filesystem."
    );
  }

  const destinationAccess = dustFs.checkWriteAccess(destination);
  if (destinationAccess.isErr()) {
    return new Err(destinationAccess.error);
  }

  const sourceManifestPath = path.posix.join(source, FRAME_MANIFEST_FILE);
  const destinationManifestPath = path.posix.join(
    destination,
    FRAME_MANIFEST_FILE
  );
  const sourceMountPath = dustFs.toMountFilePath(sourceManifestPath);
  const destinationMountPath = dustFs.toMountFilePath(destinationManifestPath);
  if (!sourceMountPath || !destinationMountPath) {
    return cloneError("invalid_source", "Invalid Frame source or destination.");
  }

  const registered = await FileResource.fetchByMountFilePaths(auth, [
    sourceMountPath,
    destinationMountPath,
  ]);
  const sourceFrame = registered.find(
    (candidate) => candidate.mountFilePath === sourceMountPath
  );
  if (!sourceFrame?.isFrameV2) {
    return cloneError(
      "invalid_source",
      `No registered Frames v2 package found at ${source}.`
    );
  }
  if (
    registered.some(
      (candidate) => candidate.mountFilePath === destinationMountPath
    )
  ) {
    return cloneError(
      "conflict",
      "A registered file already uses the destination path."
    );
  }

  const copied = await withFrameSourceLock<
    void,
    CloneFrameV2SourceError | LockAcquisitionTimeoutError
  >(sourceFrame.sId, () =>
    withFrameWorkspaceSourceLock<void, CloneFrameV2SourceError>(
      owner.sId,
      async () => {
        const freshSourceFrame = await sourceFrame.fetchFreshFrameV2(auth);
        if (
          !freshSourceFrame ||
          freshSourceFrame.mountFilePath !== sourceMountPath
        ) {
          return cloneError(
            "invalid_source",
            "The source Frame moved or was deleted before cloning started."
          );
        }

        const snapshot = await inspectFrameSourceStorage({
          destinationMountPath,
          sourceMountPath,
        });
        if (snapshot.isErr()) {
          return cloneStorageError(snapshot.error);
        }

        const registeredSourceFiles = await FileResource.fetchByMountFilePaths(
          auth,
          snapshot.value.sourceObjectNames
        );
        if (registeredSourceFiles.some((file) => file.id !== sourceFrame.id)) {
          return cloneError(
            "conflict",
            "Clone nested registered files separately before cloning this Frame."
          );
        }

        const copy = await copyFrameSourceStorage(snapshot.value);
        return copy.isErr() ? cloneStorageError(copy.error) : copy;
      }
    )
  );
  if (copied.isErr()) {
    if (isLockAcquisitionTimeoutError(copied.error)) {
      return cloneError(
        "conflict",
        "Another Frame source operation is in progress; retry shortly."
      );
    }
    return new Err(copied.error);
  }

  const registration = await registerFrameV2FromSourceUsingFileSystem(auth, {
    dustFs,
    manifestPath: destinationManifestPath,
  });
  if (registration.isErr()) {
    await dustFs.delete(destination, { ignoreNotFound: true });
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
    return publication;
  }

  logger.info(
    {
      destinationDirectoryPath: destination,
      frameId: clonedFrame.sId,
      publicationId: publication.value.publicationId,
      sourceDirectoryPath: source,
      sourceFrameId: sourceFrame.sId,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    "Cloned Frame v2"
  );

  void emitAuditLogEvent({
    auth,
    action: "frame.cloned",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("frame", {
        sId: clonedFrame.sId,
        name: path.posix.basename(destination),
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      destination_path: destination,
      publication_id: publication.value.publicationId,
      source_frame_id: sourceFrame.sId,
      source_path: source,
    },
  });

  return new Ok({
    destinationDirectoryPath: destination,
    frameId: clonedFrame.sId,
    publicationId: publication.value.publicationId,
    sourceDirectoryPath: source,
  });
}
