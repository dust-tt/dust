import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { FrameToolAuthorizationResource } from "@app/lib/resources/frame_tool_authorization_resource";

export { authorizedToolsCoverRequired } from "@app/lib/api/frames/tool_authorization_coverage";

/**
 * Whether the current user may run Frame functions that call tools.
 * Last publisher of the active publication is exempt; otherwise a stored
 * authorization must cover that publication's `requiredTools`.
 */
export async function hasAuthorizedFrameRequiredTools(
  auth: Authenticator,
  frame: FileResource
): Promise<boolean> {
  if (!frame.isFrameV2) {
    return true;
  }

  const activePublication = await FramePublicationResource.fetchActiveForFrame(
    auth,
    frame
  );
  const requiredTools = activePublication?.requiredTools ?? [];
  if (requiredTools.length === 0) {
    return true;
  }

  const user = auth.user();
  if (
    user &&
    activePublication?.publishedByUserId !== null &&
    activePublication?.publishedByUserId === user.id
  ) {
    return true;
  }

  const authorization =
    await FrameToolAuthorizationResource.fetchForUserAndFrame(auth, frame);
  return authorization
    ? authorization.coversRequiredTools(requiredTools)
    : false;
}
