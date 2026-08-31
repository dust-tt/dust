import path from "node:path";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { DustFileSystem } from "@app/lib/api/file_system";
import { withFrameSourceLock } from "@app/lib/api/frames/operation_lock";
import { removeFileFromProject } from "@app/lib/api/projects/context";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { Authenticator } from "@app/lib/auth";
import { isLockAcquisitionTimeoutError } from "@app/lib/lock";
import type { FrameV2SourceDeletion } from "@app/lib/resources/file_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { DustFileSystemError } from "@app/types/file_system";
import { isDustFileSystemError } from "@app/types/file_system";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export class FrameDeletionError extends Error {
  constructor(
    readonly code: "conflict" | "internal" | "invalid_source",
    message: string
  ) {
    super(message);
    this.name = "FrameDeletionError";
  }
}

export function isFrameDeletionError(
  error: unknown
): error is FrameDeletionError {
  return error instanceof FrameDeletionError;
}

export type DeleteFrameV2FromSourceError =
  | DustFileSystemError
  | FrameDeletionError
  | SandboxFunctionError;

function deletionError(
  code: FrameDeletionError["code"],
  message: string
): Err<FrameDeletionError> {
  return new Err(new FrameDeletionError(code, message));
}

async function deleteFrameResource(
  auth: Authenticator,
  frame: FileResource,
  manifestPath: string,
  deleteFrameSource: FrameV2SourceDeletion
): Promise<Result<void, DeleteFrameV2FromSourceError>> {
  if (frame.useCase !== "project_context") {
    const result = await frame.delete(auth, { deleteFrameSource });
    if (result.isErr()) {
      return frameResourceDeletionError(result.error);
    }
    return new Ok(undefined);
  }

  const podId = frame.useCaseMetadata?.spaceId;
  const pod = podId ? await SpaceResource.fetchById(auth, podId) : null;
  if (!pod?.isProject()) {
    return deletionError("invalid_source", "Frame source Pod not found.");
  }

  // Load Pod metadata before deleting the Frame identity. A failed fetch must leave the operation
  // retryable; the update itself remains best-effort after deletion, as in the legacy flow.
  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  const result = await removeFileFromProject(auth, {
    deleteFrameSource,
    space: pod,
    fileId: frame.sId,
  });
  if (result.isErr()) {
    return frameResourceDeletionError(result.error);
  }

  if (metadata) {
    try {
      await metadata.removeFramePath(manifestPath);
    } catch (error) {
      logger.warn(
        {
          error: normalizeError(error),
          frameId: frame.sId,
          manifestPath,
          spaceId: pod.sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "Deleted Frame but failed to remove its Pod UI references"
      );
    }
  }

  return new Ok(undefined);
}

function frameResourceDeletionError(
  error: Error
): Err<DeleteFrameV2FromSourceError> {
  if (isDustFileSystemError(error)) {
    return new Err(error);
  }
  if (isLockAcquisitionTimeoutError(error)) {
    return new Err(
      new SandboxFunctionError(
        "publish_conflict",
        "Another publication or source operation is in progress for this Frame; retry shortly."
      )
    );
  }
  return deletionError("internal", error.message);
}

/** Delete a registered Frame package and every resource owned by its stable identity. */
export async function deleteFrameV2FromSource(
  auth: Authenticator,
  {
    conversation,
    sourceDirectoryPath,
  }: {
    conversation: ConversationWithoutContentType;
    sourceDirectoryPath: string;
  }
): Promise<
  Result<
    { frameId: string; sourceDirectoryPath: string },
    DeleteFrameV2FromSourceError
  >
> {
  const sourceDirectory =
    DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  if (
    !sourceDirectory ||
    !sourceDirectory.includes("/") ||
    path.posix.basename(sourceDirectory) === FRAME_MANIFEST_FILE
  ) {
    return deletionError(
      "invalid_source",
      "Frame deletion requires its source folder under /files."
    );
  }
  const manifestPath = path.posix.join(sourceDirectory, FRAME_MANIFEST_FILE);

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(fsResult.error);
  }
  const dustFs = fsResult.value;
  if (!dustFs.isGCSBacked()) {
    return deletionError(
      "invalid_source",
      "Frames v2 deletion does not yet support the database-backed filesystem."
    );
  }

  const writeAccess = dustFs.checkWriteAccess(sourceDirectory);
  if (writeAccess.isErr()) {
    return new Err(writeAccess.error);
  }
  const mountFilePath = dustFs.toMountFilePath(manifestPath);
  if (!mountFilePath) {
    return deletionError("invalid_source", "Invalid Frame source folder.");
  }

  const [frame] = await FileResource.fetchByMountFilePaths(auth, [
    mountFilePath,
  ]);
  if (!frame?.isFrameV2) {
    return deletionError(
      "invalid_source",
      `No registered Frames v2 package found at ${sourceDirectory}.`
    );
  }

  return withFrameSourceLock<
    { frameId: string; sourceDirectoryPath: string },
    DeleteFrameV2FromSourceError
  >(frame.sId, async () => {
    const freshFrame = await FileResource.fetchById(auth, frame.sId);
    if (
      !freshFrame?.isFrameV2 ||
      freshFrame.toScopedPath(auth) !== manifestPath
    ) {
      return deletionError(
        "conflict",
        "The Frame source changed while it was being deleted; retry from its current path."
      );
    }

    const activePublicationId =
      freshFrame.useCaseMetadata?.activePublicationId ?? "";
    const resourceResult = await deleteFrameResource(
      auth,
      freshFrame,
      manifestPath,
      () =>
        dustFs.delete(sourceDirectory, {
          ignoreNotFound: true,
        })
    );
    if (resourceResult.isErr()) {
      return resourceResult;
    }

    const frameName = path.posix.basename(sourceDirectory);
    void emitAuditLogEvent({
      auth,
      action: "frame.deleted",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("frame", {
          sId: freshFrame.sId,
          name: frameName,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        active_publication_id: activePublicationId,
        frame_id: freshFrame.sId,
        source: "dsbx",
        source_path: sourceDirectory,
      },
    });

    logger.info(
      {
        activePublicationId,
        frameId: freshFrame.sId,
        sourceDirectoryPath: sourceDirectory,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Deleted Frame v2"
    );

    return new Ok({
      frameId: freshFrame.sId,
      sourceDirectoryPath: sourceDirectory,
    });
  });
}
