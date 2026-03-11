import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { PDF_FOOTER_HTML } from "@app/lib/api/files/pdf_footer";
import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import type { Authenticator } from "@app/lib/auth";
import {
  isEntreprisePlanPrefix,
  isFriendsAndFamilyPlan,
} from "@app/lib/plans/plan_codes";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { PdfOptions, WithAPIErrorResponse } from "@app/types";
import { DocumentRenderer, frameContentType, isString } from "@app/types";

const PostPdfExportBodySchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).optional().default("portrait"),
  pageMode: z.enum(["paged", "single"]).optional().default("paged"),
});

const CSS_PX_PER_IN = 96;
const A4_WIDTH_IN = 8.27;
const A4_HEIGHT_IN = 11.69;
const MEASURE_VIEWPORT_HEIGHT_PX = 1000;

function parsePngDimensions(
  buffer: Buffer
): { width: number; height: number } | null {
  if (buffer.length < 24) {
    return null;
  }

  const signature = buffer.subarray(0, 8);
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (!signature.equals(pngSignature)) {
    return null;
  }

  const ihdrType = buffer.subarray(12, 16).toString("ascii");
  if (ihdrType !== "IHDR") {
    return null;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return { width, height };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<Buffer>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  }

  const documentRendererUrl = config.getDocumentRendererUrl();
  if (!documentRendererUrl) {
    return apiError(req, res, {
      status_code: 501,
      api_error: {
        type: "internal_server_error",
        message: "PDF export is not configured.",
      },
    });
  }

  const { fileId } = req.query;
  if (!isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  // Parse and validate request body.
  const bodyResult = PostPdfExportBodySchema.safeParse(req.body);
  if (!bodyResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${bodyResult.error.message}`,
      },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Only allow Frame files.
  if (!file.isInteractiveContent || file.contentType !== frameContentType) {
    return apiError(req, res, {
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
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  }

  // Get share info to retrieve the share token.
  const shareInfo = await file.getShareInfo();
  if (!shareInfo) {
    return apiError(req, res, {
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
    fileToken: shareToken,
    userId: user?.sId,
    shareScope: shareInfo.scope,
    workspaceId: owner.sId,
  });

  // Build viz URL. Use public URL since Gotenberg routes through egress proxy
  // which blocks internal K8s IPs.
  const vizUrl = config.getVizPublicUrl();
  if (!vizUrl) {
    return apiError(req, res, {
      status_code: 501,
      api_error: {
        type: "internal_server_error",
        message: "VIZ_PUBLIC_URL is not configured.",
      },
    });
  }

  const { orientation, pageMode } = bodyResult.data;
  const isSinglePage = pageMode === "single";
  const pageWidthIn =
    orientation === "landscape" ? A4_HEIGHT_IN : A4_WIDTH_IN;
  const pageWidthPx = Math.round(pageWidthIn * CSS_PX_PER_IN);

  const params = new URLSearchParams({
    accessToken,
    identifier: `viz-${fileId}`,
    pdfMode: "true",
  });
  if (isSinglePage) {
    params.set("singlePage", "true");
    params.set("pageWidthPx", pageWidthPx.toString());
  }
  const targetUrl = `${vizUrl}/content?${params.toString()}`;

  // Only show footer for non-Enterprise plans and non-FriendsAndFamily plans.
  const plan = auth.plan();
  const showFooter =
    !plan ||
    !isEntreprisePlanPrefix(plan.code) ||
    !isFriendsAndFamilyPlan(plan.code);

  const renderer = new DocumentRenderer(documentRendererUrl, logger);

  const options: PdfOptions = showFooter
    ? {
        footerHtml: PDF_FOOTER_HTML,
        marginBottom: "1cm", // Space for footer.
      }
    : {};

  let singlePageOptions: Partial<PdfOptions> = {};
  let singlePageNotice: string | null = null;
  if (isSinglePage) {
    const measureResult = await renderer.captureScreenshot(
      {
        url: targetUrl,
        waitForExpression:
          "document.querySelector('[data-viz-ready=\"true\"]') !== null",
      },
      {
        clip: false,
        width: pageWidthPx,
        height: MEASURE_VIEWPORT_HEIGHT_PX,
      }
    );

    if (measureResult.isOk()) {
      const dims = parsePngDimensions(measureResult.value);
      if (dims && dims.height > 0) {
        const heightIn = Math.max(dims.height / CSS_PX_PER_IN, 1);
        singlePageOptions = {
          paperWidth: `${pageWidthIn}in`,
          paperHeight: `${heightIn.toFixed(2)}in`,
          scale: 1,
        };
        logger.info(
          { fileId, heightIn, pageWidthIn },
          "Single-page PDF sizing computed"
        );
      } else {
        singlePageNotice = "single-page-dimension-parse-failed";
        logger.warn({ fileId }, "Failed to parse screenshot dimensions");
      }
    } else {
      singlePageNotice = "single-page-measure-failed";
      logger.warn(
        { fileId, error: measureResult.error },
        "Failed to measure single-page height"
      );
    }
  }
  const hasSinglePageSizing =
    !!singlePageOptions.paperWidth && !!singlePageOptions.paperHeight;

  const result = await renderer.exportToPdf(
    {
      url: targetUrl,
      waitForExpression:
        "document.querySelector('[data-viz-ready=\"true\"]') !== null",
    },
    {
      ...options,
      ...singlePageOptions,
      orientation: hasSinglePageSizing ? undefined : orientation,
    }
  );

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to generate PDF.",
      },
    });
  }

  // Set response headers for PDF download.
  const fileName = file.fileName?.replace(/\.[^.]+$/, ".pdf") || "frame.pdf";
  const resolvedPageMode =
    isSinglePage && hasSinglePageSizing ? "single" : "paged";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Length", result.value.length);
  res.setHeader("X-Dust-Pdf-Page-Mode", resolvedPageMode);
  if (isSinglePage && resolvedPageMode === "paged" && singlePageNotice) {
    res.setHeader("X-Dust-Pdf-Notice", singlePageNotice);
  }

  res.status(200).send(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
