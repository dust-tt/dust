import { withFramePublishLock } from "@app/lib/api/frames/operation_lock";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionModel } from "@app/lib/resources/storage/models/sandbox_function";
import { getFrameBasePath } from "@app/types/api/frame_storage";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";
import { Op } from "sequelize";

export type DeleteFrameV2Source = () => Promise<Result<void, Error>>;

async function deleteFrameOwnedRuntime(
  auth: Authenticator,
  frame: FileResource
): Promise<Result<undefined, Error>> {
  try {
    const owner = auth.getNonNullableWorkspace();
    assert(
      frame.workspaceId === owner.id,
      "The Frame must belong to the authenticated workspace."
    );

    const sandboxFunctions = await SandboxFunctionModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: owner.id,
        fileId: frame.id,
        publicationId: { [Op.ne]: null },
      },
    });
    const sandboxFunctionModelIds = sandboxFunctions.map(({ id }) => id);
    if (sandboxFunctionModelIds.length > 0) {
      await SandboxFunctionInvocationResource.deleteAllForSandboxFunctionModelIds(
        {
          workspaceModelId: owner.id,
          sandboxFunctionModelIds,
        }
      );
      await SandboxFunctionModel.destroy({
        where: {
          id: sandboxFunctionModelIds,
          workspaceId: owner.id,
        },
      });
    }
    await getPrivateUploadBucket().deleteByPrefix(
      getFrameBasePath({ workspaceId: owner.sId, frameId: frame.sId })
    );

    return frame.deleteOwnArtifactsAndRecord(auth);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

/** Deletes a Frame source package, owned runtime, sandbox, and FileResource identity. */
export async function deleteFrameV2Package(
  auth: Authenticator,
  {
    deleteSource,
    frame,
  }: {
    deleteSource: DeleteFrameV2Source;
    frame: FileResource;
  }
): Promise<Result<void, Error>> {
  if (!frame.isFrameV2) {
    return new Err(new Error("Frame deletion requires a Frames v2 file."));
  }
  if (frame.workspaceId !== auth.getNonNullableWorkspace().id) {
    return new Err(
      new Error("The Frame must belong to the authenticated workspace.")
    );
  }

  return withFramePublishLock(frame.sId, async () => {
    const sourceResult = await deleteSource();
    if (sourceResult.isErr()) {
      return sourceResult;
    }

    return FrameSandboxAdapter.deleteSandbox(auth, frame, {
      afterSandboxCleanup: () => deleteFrameOwnedRuntime(auth, frame),
    });
  });
}
