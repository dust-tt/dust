import config from "@app/lib/api/config";
import { PDF_FOOTER_HTML } from "@app/lib/api/files/pdf_footer";
import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
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
import type { PdfOptions } from "@app/types/shared/document_renderer";
import { DocumentRenderer } from "@app/types/shared/document_renderer";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PostPdfExportBodySchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).optional(),
});

// Mounted at /api/w/:wId/files/:fileId/export/pdf.
const app = new Hono();

app.post("/", validate("json", PostPdfExportBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

  const documentRendererUrl = config.getDocumentRendererUrl();
  if (!documentRendererUrl) {
    return apiError(ctx, {
      status_code: 501,
      api_error: {
        type: "internal_server_error",
        message: "PDF export is not configured.",
      },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  // Only allow Frame files.
  if (
    !file.isInteractiveContent ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files can be exported as PDF.",
      },
    });
  }

  // Check conversation access.
  if (file.useCaseMetadata?.conversationId) {
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  }

  // Get share info to retrieve the share token.
  const shareInfo = await file.getShareInfo();
  if (!shareInfo) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not shareable.",
      },
    });
  }

  // Extract token from share URL.
  const shareUrlParts = shareInfo.shareUrl.split("/");
  const shareToken = shareUrlParts[shareUrlParts.length - 1];

  // Generate access token for viz rendering.
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
  const vizUrl = config.getVizPublicUrl();
  if (!vizUrl) {
    return apiError(ctx, {
      status_code: 501,
      api_error: {
        type: "internal_server_error",
        message: "VIZ_PUBLIC_URL is not configured.",
      },
    });
  }

  const params = new URLSearchParams({
    accessToken,
    identifier: `viz-${fileId}`,
    pdfMode: "true",
  });
  const targetUrl = `${vizUrl}/content?${params.toString()}`;

  // Default to landscape for slideshow content, portrait for regular frames.
  const { orientation: requestedOrientation } = ctx.req.valid("json");
  const orientation =
    requestedOrientation ??
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

  const renderer = new DocumentRenderer(documentRendererUrl, logger);

  // Slideshows use zero margins (full-bleed slides).
  const options: PdfOptions = showFooter
    ? {
        footerHtml: PDF_FOOTER_HTML,
        marginBottom: isSlideshow ? "0" : "1cm",
      }
    : {};

  const result = await renderer.exportToPdf(
    {
      url: targetUrl,
      waitForExpression:
        "document.querySelector('[data-viz-ready=\"true\"]') !== null",
    },
    {
      ...options,
      orientation,
    }
  );

  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to generate PDF.",
      },
    });
  }

  // Set response headers for PDF download.
  const pdfFileName = file.fileName?.replace(/\.[^.]+$/, ".pdf") || "frame.pdf";
  // Sanitize filename for Content-Disposition: use ASCII-only fallback for
  // `filename` and RFC 5987 `filename*` for the full UTF-8 name.
  const asciiFallback = pdfFileName.replace(/[^\x20-\x7E]/g, "_");
  const encodedName = encodeURIComponent(pdfFileName);

  // Convert Node `Buffer` to `Uint8Array` so it satisfies `BodyInit`.
  return new Response(new Uint8Array(result.value), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(result.value.length),
    },
  });
});

export default app;
