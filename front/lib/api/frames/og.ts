/**
 * Per-frame Open Graph preview images.
 *
 * GCS layout (private bucket):
 *   w/{wId}/frames/{frameId}/og.png   1200x630 PNG of the first Frame viewport
 *
 * Served world-readable at /api/v1/public/frames/:token/og so Slack/mobile
 * crawlers can fetch them without auth (the share token is the capability).
 */

import config from "@app/lib/api/config";
import { screenshotInteractiveContentFile } from "@app/lib/api/files/screenshot";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { launchGenerateFrameOgImageWorkflow } from "@app/temporal/frame_og/client";
import { getFrameOgImagePath } from "@app/types/api/frame_storage";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type FrameOgImageState = { version: string } | null;

export function buildFrameOgImagePublicUrl(
  { token }: { token: string },
  { version, baseUrl }: { version?: string; baseUrl?: string } = {}
): string {
  const base = baseUrl ?? config.getApiBaseUrl();
  const url = `${base}/api/v1/public/frames/${token}/og`;

  return version ? `${url}?v=${version}` : url;
}

export async function getFrameOgImageState({
  workspaceId,
  frameId,
}: {
  workspaceId: string;
  frameId: string;
}): Promise<Result<FrameOgImageState, Error>> {
  try {
    const [metadata] = await getPrivateUploadBucket()
      .file(getFrameOgImagePath({ workspaceId, frameId }))
      .getMetadata();

    return new Ok({ version: String(metadata.generation ?? "") });
  } catch (err) {
    if (isGCSNotFoundError(err)) {
      return new Ok(null);
    }

    logger.error(
      {
        workspaceId,
        frameId,
        error: normalizeError(err),
      },
      "Error fetching Frame OG image metadata"
    );

    return new Err(normalizeError(err));
  }
}

/**
 * Returns a public OG URL when a per-frame preview exists, otherwise null so
 * callers can fall back to workspace branding / the static default.
 */
export async function getFrameOgImagePublicUrlIfExists({
  workspaceId,
  frameId,
  token,
}: {
  workspaceId: string;
  frameId: string;
  token: string;
}): Promise<string | null> {
  const state = await getFrameOgImageState({ workspaceId, frameId });
  if (state.isErr() || !state.value) {
    return null;
  }

  return buildFrameOgImagePublicUrl(
    { token },
    { version: state.value.version }
  );
}

export async function generateAndStoreFrameOgImage(
  auth: Authenticator,
  frame: FileResource
): Promise<Result<void, Error>> {
  const workspace = auth.workspace();
  if (!workspace) {
    return new Err(new Error("Workspace not found."));
  }

  const screenshot = await screenshotInteractiveContentFile(auth, {
    fileId: frame.sId,
  });
  if (screenshot.isErr()) {
    return new Err(new Error(screenshot.error.message));
  }

  const ogPath = getFrameOgImagePath({
    workspaceId: workspace.sId,
    frameId: frame.sId,
  });

  try {
    await getPrivateUploadBucket().file(ogPath).save(screenshot.value.buffer, {
      contentType: "image/png",
      resumable: false,
    });

    logger.info(
      { workspaceId: workspace.sId, frameId: frame.sId },
      "Stored Frame OG image"
    );

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        workspaceId: workspace.sId,
        frameId: frame.sId,
        error: normalizeError(err),
      },
      "Error saving Frame OG image"
    );

    return new Err(normalizeError(err));
  }
}

/**
 * Enqueue async OG generation after a successful publish/activation.
 * Failures to start the workflow are logged and do not fail the publish.
 */
export function scheduleFrameOgImageGeneration(
  auth: Authenticator,
  frame: FileResource
): void {
  const workspace = auth.workspace();
  if (!workspace) {
    return;
  }

  void launchGenerateFrameOgImageWorkflow({
    workspaceId: workspace.sId,
    frameId: frame.sId,
  }).then((result) => {
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          frameId: frame.sId,
          error: result.error,
        },
        "Failed to schedule Frame OG image generation"
      );
    }
  });
}
