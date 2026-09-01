import { withFramePublishLock } from "@app/lib/api/frames/operation_lock";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import {
  getFrameBasePath,
  getFramesBasePath,
} from "@app/types/api/frame_storage";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type DeleteFrameV2Source = () => Promise<Result<void, Error>>;

/** Frames v2 lifecycle boundary over the canonical FileResource identity. */
export class FrameResource extends FileResource {
  private constructor(file: FileResource) {
    super(FileResource.model, file);
  }

  static fromFileResource(file: FileResource): Result<FrameResource, Error> {
    if (!file.isFrameV2) {
      return new Err(new Error("Frame deletion requires a Frames v2 file."));
    }

    return new Ok(new FrameResource(file));
  }

  static async deleteAllOwnedResourcesForWorkspace(
    auth: Authenticator
  ): Promise<void> {
    const owner = auth.getNonNullableWorkspace();
    await FrameSandboxAdapter.deleteAllForWorkspace(auth);
    await SandboxFunctionResource.deleteAllFrameFunctionsForWorkspace(owner.id);
    await getPrivateUploadBucket().deleteByPrefix(
      getFramesBasePath({ workspaceId: owner.sId })
    );
  }

  private async deleteOwnedRuntimeAndIdentity(
    auth: Authenticator
  ): Promise<Result<undefined, Error>> {
    try {
      const owner = auth.getNonNullableWorkspace();
      await SandboxFunctionResource.deleteAllForFrame(auth, this);
      await getPrivateUploadBucket().deleteByPrefix(
        getFrameBasePath({ workspaceId: owner.sId, frameId: this.sId })
      );

      return this.deleteOwnArtifactsAndRecord(auth);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  async deletePackage(
    auth: Authenticator,
    { deleteSource }: { deleteSource: DeleteFrameV2Source }
  ): Promise<Result<void, Error>> {
    if (this.workspaceId !== auth.getNonNullableWorkspace().id) {
      return new Err(
        new Error("The Frame must belong to the authenticated workspace.")
      );
    }

    return withFramePublishLock(this.sId, async () => {
      const sourceResult = await deleteSource();
      if (sourceResult.isErr()) {
        return sourceResult;
      }

      return FrameSandboxAdapter.deleteSandbox(auth, this, {
        afterSandboxCleanup: () => this.deleteOwnedRuntimeAndIdentity(auth),
      });
    });
  }
}
