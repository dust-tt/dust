import config from "@app/lib/api/config";
import { PDF_FOOTER_HTML } from "@app/lib/api/files/pdf_footer";
import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import type { Authenticator } from "@app/lib/auth";
import {
  isDustCompanyPlan,
  isEntreprisePlanPrefix,
  isFriendsAndFamilyPlan,
} from "@app/lib/plans/plan_codes";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import {
  frameSlideshowContentType,
  isInteractiveContentType,
} from "@app/types/files";
import type { PdfOptions, PdfOrientation } from "@app/types/shared/document_renderer";
import { DocumentRenderer } from "@app/types/shared/document_renderer";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Shared by pdf_export and screenshot — kept here as the primary export file.
export type FrameExportError = {
  type: "file_not_found" | "invalid_request" | "render_failed";
  message: string;
};

export async function exportInteractiveContentFileAsPdf(
  auth: Authenticator,
  {
    fileId,
    orientation,
  }: {
    fileId: string;
    orientation?: PdfOrientation;
  }
): Promise<Result<{ buffer: Buffer; fileName: string }, FrameExportError>> {
  const documentRendererUrl = config.getDocumentRendererUrl();
  if (!documentRendererUrl) {
    return new Err({ type: "render_failed", message: "PDF export is not configured." });
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
      message: "Only Frame files can be exported as PDF.",
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
    return new Err({ type: "invalid_request", message: "File is not shareable." });
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
    pdfMode: "true",
  });
  const targetUrl = `${config.getVizPublicUrl()}/content?${params.toString()}`;

  // Default to landscape for slideshow content, portrait for regular frames.
  const resolvedOrientation =
    orientation ??
    (file.contentType === frameSlideshowContentType ? "landscape" : "portrait");

  const isSlideshow = file.contentType === frameSlideshowContentType;

  // Only show footer for non-Enterprise plans and non-FriendsAndFamily plans.
  const plan = auth.plan();
  const shouldHideFooter =
    plan &&
    (isDustCompanyPlan(plan.code) ||
      isEntreprisePlanPrefix(plan.code) ||
      isFriendsAndFamilyPlan(plan.code));
  const showFooter = !shouldHideFooter;

  // Slideshows use zero margins (full-bleed slides).
  const options: PdfOptions = showFooter
    ? {
        footerHtml: PDF_FOOTER_HTML,
        marginBottom: isSlideshow ? "0" : "1cm",
      }
    : {};

  const renderer = new DocumentRenderer(documentRendererUrl, logger, {
    timeoutMs: 90000,
  });
  const result = await renderer.exportToPdf(
    {
      url: targetUrl,
      waitForExpression:
        "document.querySelector('[data-viz-ready=\"true\"]') !== null",
    },
    {
      ...options,
      orientation: resolvedOrientation,
    }
  );

  if (result.isErr()) {
    return new Err({ type: "render_failed", message: "Failed to generate PDF." });
  }

  const fileName = file.fileName?.replace(/\.[^.]+$/, ".pdf") || "frame.pdf";
  return new Ok({ buffer: result.value, fileName });
}
