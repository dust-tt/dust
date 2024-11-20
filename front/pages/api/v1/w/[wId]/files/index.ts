import type { FileUploadRequestResponseType } from "@dust-tt/client";
import { FileUploadUrlRequestSchema } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import {
  ensureContentTypeForUseCase,
  ensureFileSize,
  isSupportedFileContentType,
  rateLimiter,
} from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

/**
 * @swagger
 * /api/v1/w/{wId}/files:
 *   post:
 *     summary: Create a file upload URL
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contentType
 *               - fileName
 *               - fileSize
 *               - useCase
 *               - useCaseMetadata
 *             properties:
 *               contentType:
 *                 type: string
 *                 description: MIME type of the file
 *               fileName:
 *                 type: string
 *                 description: Name of the file
 *               fileSize:
 *                 type: integer
 *                 description: Size of the file in bytes
 *               useCase:
 *                 type: string
 *                 description: Intended use case for the file, use "conversation"
 *               useCaseMetadata:
 *                 type: string
 *                 description: (optional) Metadata for the use case, for conversation useCase should be dictionary with conversationId stringified
 *     responses:
 *       200:
 *         description: File upload URL created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file:
 *                   type: object
 *                   properties:
 *                     uploadUrl:
 *                       type: string
 *       400:
 *         description: Invalid request or unsupported file type
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileUploadRequestResponseType>>,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST": {
      const r = FileUploadUrlRequestSchema.safeParse(req.body);
      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${r.error.message}`,
          },
        });
      }

      // Agressively rate limit file uploads.
      const remaining = await rateLimiter({
        key: `workspace:${owner.id}:file_uploads`,
        maxPerTimeframe: 40,
        timeframeSeconds: 60,
        logger,
      });
      if (remaining < 0) {
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message: "You have reached the rate limit for this workspace.",
          },
        });
      }

      const { contentType, fileName, fileSize, useCase, useCaseMetadata } =
        r.data;

      if (!isSupportedFileContentType(contentType)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_type_not_supported",
            message: `Content type "${contentType}" is not supported.`,
          },
        });
      }

      if (!ensureContentTypeForUseCase(contentType, useCase)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_type_not_supported",
            message: `Content type "${contentType}" is not supported for use-case ${useCase}.`,
          },
        });
      }

      if (!ensureFileSize(contentType, fileSize)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_too_large",
            message: `File "${fileName}" is too large.`,
          },
        });
      }

      const file = await FileResource.makeNew({
        contentType,
        fileName,
        fileSize,
        userId: user.id,
        workspaceId: owner.id,
        useCase,
        useCaseMetadata: useCaseMetadata,
      });

      res.status(200).json({ file: file.toPublicJSONWithUploadUrl(auth) });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler, {
  requiredScopes: { POST: "create:file" },
});
