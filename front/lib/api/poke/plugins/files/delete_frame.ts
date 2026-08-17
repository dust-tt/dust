import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { createPlugin } from "@app/lib/api/poke/types";
import { removeFileFromProject } from "@app/lib/api/projects/context";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

async function deleteFrame(
  auth: Authenticator,
  file: FileResource
): Promise<Result<void, Error>> {
  if (file.useCase !== "project_context") {
    return file.delete(auth);
  }

  const podId = file.useCaseMetadata?.spaceId;
  const pod = podId ? await SpaceResource.fetchById(auth, podId) : null;
  if (!pod?.isProject()) {
    return new Err(new Error("Pod not found for this Frame."));
  }

  const scopedPath = file.toScopedPath(auth);
  if (!scopedPath) {
    return new Err(new Error("Canonical Pod path not found for this Frame."));
  }

  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  // Cleans up project references, then delegates GCS and DB deletion to FileResource.delete().
  const deleteResult = await removeFileFromProject(auth, {
    space: pod,
    fileId: file.sId,
  });
  if (deleteResult.isErr()) {
    return new Err(deleteResult.error);
  }

  if (metadata && scopedPath) {
    try {
      await metadata.removeFramePath(scopedPath);
    } catch (error) {
      // The Frame is already deleted at this point, so do not report a failed
      // operation that cannot safely be retried. Keep the metadata cleanup
      // best-effort and retain enough context to repair stale tabs manually.
      logger.warn(
        {
          error,
          fileId: file.sId,
          framePath: scopedPath,
          spaceId: pod.sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
        },
        "[Poke Plugin] Deleted Frame but failed to clean up Pod metadata"
      );
    }
  }

  return new Ok(undefined);
}

export const deleteFramePlugin = createPlugin({
  manifest: {
    id: "delete-frame",
    name: "Delete Frame",
    description: "Permanently delete this Frame and invalidate its share URL.",
    warning: "This is permanent and cannot be undone.",
    resourceTypes: ["files"],
    args: {
      confirmation: {
        type: "string",
        label: "Type DELETE to confirm",
        description: "Deletion cannot be undone.",
      },
    },
    requiredRoles: ["engineering", "support"],
  },
  execute: async (auth, file, args) => {
    if (!file?.isInteractiveContent) {
      return new Err(new Error("Frame not found."));
    }
    if (args.confirmation !== "DELETE") {
      return new Err(new Error("Type DELETE to confirm deletion."));
    }

    const frameName = file.fileName ?? file.sId;
    const deleteResult = await deleteFrame(auth, file);
    if (deleteResult.isErr()) {
      return deleteResult;
    }

    void emitAuditLogEvent({
      auth,
      action: "frame.deleted_admin",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("frame", {
          sId: file.sId,
          name: frameName,
        }),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        frame_name: frameName,
        source: "poke",
      },
    });

    return new Ok({
      display: "text",
      value: `Frame "${frameName}" was permanently deleted.`,
    });
  },
  isApplicableTo: (auth, file) => file?.isInteractiveContent === true,
});
