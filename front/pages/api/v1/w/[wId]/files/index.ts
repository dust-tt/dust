import type { FileUploadRequestResponseType } from "@dust-tt/client";
import { FileUploadUrlRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { isUploadSupported } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import {
  ensureFileSize,
  isPubliclySupportedUseCase,
  isSupportedFileContentType,
} from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/files:
 *   post:
 *     tags:
 *       - Conversations
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
 *                     sId:
 *                       type: string
 *                       description: Unique string identifier for the file
 *                     uploadUrl:
 *                       type: string
 *                       description: Upload URL for the file
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
  const user = auth.user();
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST": {
      const r = FileUploadUrlRequestSchema.safeParse(req.body);
      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      // Only useCase "conversation" is supported for public API.
      const { contentType, fileName, fileSize, useCase, useCaseMetadata } =
        r.data;

      if (!auth.isSystemKey()) {
        // Agressively rate limit file uploads when not a system key.
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

        // Limit use-case if not a system key.
        if (!isPubliclySupportedUseCase(useCase)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "The file use case is not supported by the API.",
            },
          });
        }
      }

      if (!isSupportedFileContentType(contentType)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_type_not_supported",
            message: `Content type "${contentType}" is not supported.`,
          },
        });
      }

      if (!isUploadSupported({ auth, contentType, useCase })) {
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
        userId: user?.id ?? null,
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
