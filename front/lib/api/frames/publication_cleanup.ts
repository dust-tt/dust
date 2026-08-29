import { withFramePublishLock } from "@app/lib/api/frames/publication_storage";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { getFramePublicationBasePath } from "@app/types/api/frame_storage";
import { Ok } from "@app/types/shared/result";

/**
 * Deletes one retired publication once no invocation still needs its immutable artifacts.
 * Returns false while a running invocation keeps the publication alive.
 */
export async function cleanupRetiredFramePublication(
  auth: Authenticator,
  {
    frameId,
    publicationId,
  }: {
    frameId: string;
    publicationId: string;
  }
): Promise<boolean> {
  const owner = auth.getNonNullableWorkspace();
  const result = await withFramePublishLock(frameId, async () => {
    const frame = await FileResource.fetchById(auth, frameId);
    if (frame?.useCaseMetadata?.activePublicationId === publicationId) {
      return new Ok(true);
    }

    if (
      frame?.isFrameV2 &&
      (await SandboxFunctionResource.hasRunningInvocationsForFramePublication(
        auth,
        { frame, publicationId }
      ))
    ) {
      return new Ok(false);
    }

    await getPrivateUploadBucket().deleteByPrefix(
      getFramePublicationBasePath({
        workspaceId: owner.sId,
        frameId,
        publicationId,
      })
    );

    if (frame?.isFrameV2) {
      await SandboxFunctionResource.deleteUnreferencedFramePublicationFunctions(
        auth,
        { frame, publicationId }
      );
    }

    return new Ok(true);
  });

  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}
