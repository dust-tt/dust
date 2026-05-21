import config from "@app/lib/api/config";
import type { FrameExportError } from "@app/lib/api/files/pdf_export";
import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { isInteractiveContentType } from "@app/types/files";
import type { ScreenshotOptions } from "@app/types/shared/document_renderer";
import { DocumentRenderer } from "@app/types/shared/document_renderer";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function screenshotInteractiveContentFile(
  auth: Authenticator,
  {
    fileId,
    screenshotOptions,
  }: {
    fileId: string;
    screenshotOptions?: ScreenshotOptions;
  }
): Promise<Result<{ buffer: Buffer; fileName: string }, FrameExportError>> {
  const documentRendererUrl = config.getDocumentRendererUrl();
  if (!documentRendererUrl) {
    return new Err({
      type: "render_failed",
      message: "Screenshot export is not configured.",
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return new Err({ type: "file_not_found", message: "File not found." });
  }

  if (
    !file.isInteractiveContent ||
    !isInteractiveContentType(file.contentType)
  ) {
    return new Err({
      type: "invalid_request",
      message: "Only Frame files can be exported as PNG.",
    });
  }

  if (file.useCaseMetadata?.conversationId) {
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );

    if (!conversation) {
      return new Err({ type: "file_not_found", message: "File not found." });
    }
  }

  const shareInfo = await file.getShareInfo();
  if (!shareInfo) {
    return new Err({
      type: "invalid_request",
      message: "File is not shareable.",
    });
  }

  const shareUrlParts = shareInfo.shareUrl.split("/");
  const shareToken = shareUrlParts[shareUrlParts.length - 1];

  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();
  const accessToken = generateVizAccessToken({
    contentType: file.contentType,
    fileToken: shareToken,
    userId: user?.sId,
    shareScope: shareInfo.scope,
    workspaceId: owner.sId,
  });

  // Build viz URL. Use public URL since Gotenberg routes through egress proxy
  // which blocks internal K8s IPs.
  const params = new URLSearchParams({
    accessToken,
    identifier: `viz-${fileId}`,
  });
  const targetUrl = `${config.getVizPublicUrl()}/content?${params.toString()}`;

  const renderer = new DocumentRenderer(documentRendererUrl, logger, {
    timeoutMs: 90000,
  });
  const result = await renderer.captureScreenshot(
    {
      url: targetUrl,
      waitForExpression:
        "document.querySelector('[data-viz-ready=\"true\"]') !== null",
    },
    screenshotOptions
  );

  if (result.isErr()) {
    return new Err({
      type: "render_failed",
      message: "Failed to generate PNG screenshot.",
    });
  }

  const fileName = file.fileName?.replace(/\.[^.]+$/, ".png") || "frame.png";
  return new Ok({ buffer: result.value, fileName });
}
