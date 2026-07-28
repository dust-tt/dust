import { screenshotInteractiveContentFile } from "@app/lib/api/files/screenshot";
import type { Authenticator } from "@app/lib/auth";
import { getPublicUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function buildFramePreviewStoragePath({
  workspaceId,
  fileId,
}: {
  workspaceId: string;
  fileId: string;
}): string {
  return `w/${workspaceId}/frame-email-previews/${fileId}.png`;
}

export interface ConversationFramePreview {
  // Public URL of the hosted PNG screenshot, embedded as an <img> in the email.
  imageUrl: string;
  // Public share URL of the live, interactive Frame, so the email can link the
  // preview back to the real thing.
  frameUrl: string;
}

// Resolves the Frame pinned to the conversation's Pod, renders it to a PNG, and
// hosts it on the public bucket so it can be embedded as a remote <img> in
// notification emails. Also returns the Frame's public share URL so the email
// can link the static preview to the live interactive Frame.
//
// Best-effort: returns null on any failure so callers can fall back to an email
// without a preview image rather than failing to send.
export async function getConversationFramePreview(
  auth: Authenticator,
  { conversationId }: { conversationId: string }
): Promise<ConversationFramePreview | null> {
  const workspace = auth.getNonNullableWorkspace();

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation?.spaceId) {
    return null;
  }

  const [space] = await SpaceResource.fetchByModelIds(auth, [
    conversation.spaceId,
  ]);
  if (!space || !space.isProject()) {
    return null;
  }

  const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
  if (!metadata?.pinnedFramePath) {
    return null;
  }

  const frame = await FileResource.fetchPinnedPodFrame(auth, {
    spaceId: space.sId,
    pinnedFramePath: metadata.pinnedFramePath,
  });
  if (!frame) {
    return null;
  }

  const shareInfo = await frame.getShareInfo();
  if (!shareInfo) {
    logger.info(
      { conversationId, workspaceId: workspace.sId, fileId: frame.sId },
      "[activation] Pinned Frame has no shareable link; email falls back to no preview image."
    );
    return null;
  }

  const screenshotResult = await screenshotInteractiveContentFile(auth, {
    fileId: frame.sId,
  });
  if (screenshotResult.isErr()) {
    return null;
  }

  const storagePath = buildFramePreviewStoragePath({
    workspaceId: workspace.sId,
    fileId: frame.sId,
  });

  try {
    const bucket = getPublicUploadBucket();
    await bucket.uploadBufferToBucket({
      buffer: screenshotResult.value.buffer,
      contentType: "image/png",
      filePath: storagePath,
    });
    return {
      imageUrl: bucket.file(storagePath).publicUrl(),
      frameUrl: shareInfo.shareUrl,
    };
  } catch (err) {
    logger.error(
      {
        conversationId,
        workspaceId: workspace.sId,
        fileId: frame.sId,
        error: normalizeError(err),
      },
      "[activation] Failed to upload Frame PNG preview; email falls back to no preview image."
    );
    return null;
  }
}
