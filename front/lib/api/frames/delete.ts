import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { DeleteFrameV2Source } from "@app/lib/resources/frame_resource";
import { FrameResource } from "@app/lib/resources/frame_resource";
import type { Result } from "@app/types/shared/result";

export type { DeleteFrameV2Source };

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
  const frameResult = FrameResource.fromFileResource(frame);
  if (frameResult.isErr()) {
    return frameResult;
  }

  return frameResult.value.deletePackage(auth, { deleteSource });
}
