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
import type { WithAPIErrorResponse } from "@app/types/error";
import { frameContentType } from "@app/types/files";
import type { PdfOptions } from "@app/types/shared/document_renderer";
import { DocumentRenderer } from "@app/types/shared/document_renderer";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PostPdfExportBodySchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).optional().default("portrait"),
});

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

  const params = new URLSearchParams({
    accessToken,
    identifier: `viz-${fileId}`,
    pdfMode: "true",
  });
  const targetUrl = `${vizUrl}/content?${params.toString()}`;

  const { orientation } = bodyResult.data;

  // Only show footer for non-Enterprise plans and non-FriendsAndFamily plans.
  const plan = auth.plan();
  const shouldHideFooter =
    plan &&
    (isEntreprisePlanPrefix(plan.code) || isFriendsAndFamilyPlan(plan.code));
  const showFooter = !shouldHideFooter;

  const renderer = new DocumentRenderer(documentRendererUrl, logger);

  const options: PdfOptions = showFooter
    ? {
        footerHtml: PDF_FOOTER_HTML,
        marginBottom: "1cm", // Space for footer.
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
  // Sanitize filename for Content-Disposition: use ASCII-only fallback for
  // `filename` and RFC 5987 `filename*` for the full UTF-8 name.
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, "_");
  const encodedName = encodeURIComponent(fileName);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
  );
  res.setHeader("Content-Length", result.value.length);

  res.status(200).send(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
