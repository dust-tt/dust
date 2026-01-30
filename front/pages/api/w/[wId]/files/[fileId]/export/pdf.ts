import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { z } from "zod";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { generateVizAccessToken } from "@app/lib/api/viz/access_tokens";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { PdfOptions, WithAPIErrorResponse } from "@app/types";
import { DocumentRenderer, frameContentType, isString } from "@app/types";
import {
  isEntreprisePlanPrefix,
  isFriendsAndFamilyPlan,
} from "@app/lib/plans/plan_codes";

/**
 * Builds the PDF footer HTML by loading the template and logo from files.
 * The logo SVG is inlined because Gotenberg cannot load external assets.
 */
function buildPdfFooterHtml(): string {
  const footerTemplatePath = path.join(
    process.cwd(),
    "lib/api/files/pdf_footer.html"
  );
  const logoPath = path.join(
    process.cwd(),
    "public/static/landing/logos/dust/Dust_LogoSquare.svg"
  );

  const footerTemplate = fs.readFileSync(footerTemplatePath, "utf-8");
  const logoSvg = fs.readFileSync(logoPath, "utf-8");

  // Resize the logo for footer (16x16).
  const resizedLogo = logoSvg.replace(
    /width="48" height="48"/,
    'width="16" height="16"'
  );

  return footerTemplate.replace("{{LOGO_SVG}}", resizedLogo);
}

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
  const showFooter =
    !plan ||
    !isEntreprisePlanPrefix(plan.code) ||
    !isFriendsAndFamilyPlan(plan.code);

  const renderer = new DocumentRenderer(documentRendererUrl, logger);

  const options: PdfOptions = showFooter
    ? {
        footerHtml: buildPdfFooterHtml(),
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
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Length", result.value.length);

  res.status(200).send(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
