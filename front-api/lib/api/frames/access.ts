import {
  FRAME_SESSION_COOKIE_NAME,
  getFrameSessionEmail,
} from "@app/lib/api/share/frame_session";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";

export type FrameViewerAccess = {
  workspace: LightWorkspaceType;
  file: FileResource;
  shareableFileId: ModelId;
  podSpaceId: string;
  email: string;
  auth: Authenticator;
};

/**
 * Resolves the pod (project space) sId that a frame's functions run in. A frame is attached either
 * directly to a space (project frame → useCaseMetadata.spaceId) or to a conversation (conversation
 * frame → useCaseMetadata.conversationId), whose own space is the pod. Returns null when neither
 * yields a space (e.g. a global conversation with no pod → no functions to call).
 */
async function resolvePodSpaceId(
  workspace: LightWorkspaceType,
  file: FileResource
): Promise<string | null> {
  const directSpaceId = file.useCaseMetadata?.spaceId;
  if (directSpaceId) {
    return directSpaceId;
  }

  const conversationId = file.useCaseMetadata?.conversationId;
  if (!conversationId) {
    return null;
  }

  // Conversation frames carry no spaceId; the pod is the conversation's own space. Authorization is
  // proven by the frame grant checked below, so read the conversation directly (skipping
  // space-membership filtering) and encode its spaceId — no permissioned space fetch needed.
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const conversation = await ConversationResource.fetchById(
    adminAuth,
    conversationId,
    { dangerouslySkipPermissionFiltering: true }
  );
  if (!conversation?.spaceId) {
    return null;
  }

  return SpaceResource.modelIdToSId({
    id: conversation.spaceId,
    workspaceId: workspace.id,
  });
}

/**
 * Resolves and authorizes an external frame viewer for a share token, then builds the userless
 * execution Authenticator confined to the frame's pod. Returns null on any failure so callers
 * respond with a uniform 404 that reveals nothing about why access was denied.
 */
export async function resolveFrameViewerAccess(
  ctx: Context,
  token: string
): Promise<FrameViewerAccess | null> {
  const shareResult = await FileResource.fetchByShareToken(token);
  if (shareResult.isErr()) {
    return null;
  }
  const { file, shareableFileId, workspace } = shareResult.value;

  // Functions are only reachable when the frame is backed by a pod (project space).
  const podSpaceId = await resolvePodSpaceId(workspace, file);
  if (!podSpaceId) {
    return null;
  }

  // Verified email (frame-session cookie) + active grant on this frame. The cookie proves the
  // email; the grant proves it was invited here.
  const sessionToken = getCookie(ctx, FRAME_SESSION_COOKIE_NAME);
  const email = sessionToken
    ? await getFrameSessionEmail(workspace, { token: sessionToken })
    : null;
  if (email === null) {
    return null;
  }

  const grant = await FileResource.getActiveGrantForEmail(workspace, {
    email,
    shareableFileId,
  });
  if (!grant) {
    return null;
  }

  const auth = await Authenticator.frameViewerForPod(workspace.sId, podSpaceId);
  return { workspace, file, shareableFileId, podSpaceId, email, auth };
}
