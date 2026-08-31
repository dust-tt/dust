import path from "node:path";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { DustFileSystem } from "@app/lib/api/file_system";
import { removeFileFromProject } from "@app/lib/api/projects/context";
import type { Authenticator } from "@app/lib/auth";
import type { FrameV2SourceDeletion } from "@app/lib/resources/file_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function deletionError(message: string): Err<Error> {
  return new Err(new Error(message));
}

async function deleteFrameResource(
  auth: Authenticator,
  {
    deleteFrameSource,
    frame,
    manifestPath,
  }: {
    deleteFrameSource: FrameV2SourceDeletion;
    frame: FileResource;
    manifestPath: string;
  }
): Promise<Result<void, Error>> {
  if (frame.useCase !== "project_context") {
    return frame.delete(auth, { deleteFrameSource });
  }

  const podId = frame.useCaseMetadata?.spaceId;
  const pod = podId ? await SpaceResource.fetchById(auth, podId) : null;
  if (!pod?.isProject()) {
    return deletionError("Frame source Pod not found.");
  }

  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  const result = await removeFileFromProject(auth, {
    deleteFrameSource: async () => {
      const sourceResult = await deleteFrameSource();
      if (sourceResult.isErr()) {
        return sourceResult;
      }
      try {
        if (metadata) {
          await metadata.removeFramePath(manifestPath);
        }
      } catch (error) {
        return new Err(normalizeError(error));
      }
      return new Ok(undefined);
    },
    space: pod,
    fileId: frame.sId,
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok(undefined);
}

async function deleteFrameV2(
  auth: Authenticator,
  {
    dustFileSystem,
    frame,
    sourceDirectoryPath,
  }: {
    dustFileSystem: DustFileSystem;
    frame: FileResource;
    sourceDirectoryPath: string;
  }
): Promise<Result<void, Error>> {
  const sourceDirectory =
    DustFileSystem.normalizeScopedPath(sourceDirectoryPath);
  if (
    !sourceDirectory ||
    !sourceDirectory.includes("/") ||
    path.posix.basename(sourceDirectory) === FRAME_MANIFEST_FILE
  ) {
    return deletionError(
      "Frame deletion requires its source folder under /files."
    );
  }
  const manifestPath = path.posix.join(sourceDirectory, FRAME_MANIFEST_FILE);

  if (!dustFileSystem.isGCSBacked()) {
    return deletionError(
      "Frames v2 deletion does not yet support the database-backed filesystem."
    );
  }
  const writeAccess = dustFileSystem.checkWriteAccess(sourceDirectory);
  if (writeAccess.isErr()) {
    return new Err(writeAccess.error);
  }
  if (!frame.isFrameV2 || frame.toScopedPath(auth) !== manifestPath) {
    return deletionError(
      `No registered Frames v2 package found at ${sourceDirectory}.`
    );
  }

  const descendantFrames = await FileResource.fetchFrameV2Descendants(
    auth,
    frame
  );
  if (descendantFrames.length > 0) {
    return deletionError(
      "Delete nested Frames before deleting their parent package."
    );
  }

  let deletedFrame = frame;
  const resourceResult = await deleteFrameResource(auth, {
    frame,
    manifestPath,
    deleteFrameSource: async () => {
      const freshFrame = await FileResource.fetchById(auth, frame.sId);
      if (
        !freshFrame?.isFrameV2 ||
        freshFrame.toScopedPath(auth) !== manifestPath
      ) {
        return deletionError(
          "The Frame source changed while it was being deleted; retry from its current path."
        );
      }
      deletedFrame = freshFrame;
      return dustFileSystem.delete(sourceDirectory, { ignoreNotFound: true });
    },
  });
  if (resourceResult.isErr()) {
    return resourceResult;
  }

  const activePublicationId =
    deletedFrame.useCaseMetadata?.activePublicationId ?? "";
  const frameName = path.posix.basename(sourceDirectory);
  void emitAuditLogEvent({
    auth,
    action: "frame.deleted",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("frame", {
        sId: deletedFrame.sId,
        name: frameName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      active_publication_id: activePublicationId,
      frame_id: deletedFrame.sId,
      source: "api",
      source_path: sourceDirectory,
    },
  });

  logger.info(
    {
      activePublicationId,
      frameId: deletedFrame.sId,
      source: "api",
      sourceDirectoryPath: sourceDirectory,
      workspaceId: auth.getNonNullableWorkspace().sId,
    },
    "Deleted Frame v2"
  );

  return new Ok(undefined);
}

/** Delete the package owned by a known Frames v2 FileResource. */
export async function deleteFrameV2FromFile(
  auth: Authenticator,
  {
    frame,
  }: {
    frame: FileResource;
  }
): Promise<Result<void, Error>> {
  const manifestPath = frame.toScopedPath(auth);
  if (!manifestPath) {
    return deletionError("Frame source path not found.");
  }
  const fileSystemResult = await DustFileSystem.fromScopedPath(
    auth,
    manifestPath
  );
  if (fileSystemResult.isErr()) {
    return new Err(fileSystemResult.error);
  }
  return deleteFrameV2(auth, {
    dustFileSystem: fileSystemResult.value,
    frame,
    sourceDirectoryPath: path.posix.dirname(manifestPath),
  });
}
