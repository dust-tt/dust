import { cleanupRetiredFramePublication } from "@app/lib/api/frames/publication_cleanup";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getFramePublicationBasePath } from "@app/types/api/frame_storage";

export async function cleanupRetiredFramePublicationActivity({
  frameId,
  publicationId,
  workspaceId,
}: {
  frameId: string;
  publicationId: string;
  workspaceId: string;
}): Promise<boolean> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    await getPrivateUploadBucket().deleteByPrefix(
      getFramePublicationBasePath({ workspaceId, frameId, publicationId })
    );
    return true;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  return cleanupRetiredFramePublication(auth, { frameId, publicationId });
}
