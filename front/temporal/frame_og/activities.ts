import { generateAndStoreFrameOgImage } from "@app/lib/api/frames/og";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { isFrameContentType } from "@app/types/files";

export async function generateFrameOgImageActivity({
  workspaceId,
  frameId,
}: {
  workspaceId: string;
  frameId: string;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const frame = await FileResource.fetchById(auth, frameId);

  if (!frame) {
    logger.warn(
      { workspaceId, frameId },
      "[Frame OG] Frame not found; skipping OG generation"
    );
    return;
  }

  if (!isFrameContentType(frame.contentType)) {
    logger.warn(
      { workspaceId, frameId, contentType: frame.contentType },
      "[Frame OG] File is not a Frame; skipping OG generation"
    );
    return;
  }

  const result = await generateAndStoreFrameOgImage(auth, frame);
  if (result.isErr()) {
    logger.error(
      { workspaceId, frameId, error: result.error },
      "[Frame OG] Failed to generate Frame OG image"
    );
    // Throw so Temporal retries transient Gotenberg / viz readiness failures.
    throw result.error;
  }
}
