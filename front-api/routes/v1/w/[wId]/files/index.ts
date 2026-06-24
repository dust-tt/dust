import { isUploadSupportedForContentType } from "@app/lib/api/files/processing";
import { buildEffectiveUseCaseMetadata } from "@app/lib/api/files/upload_metadata";
import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import {
  ensureFileSize,
  isPubliclySupportedUseCase,
  isSupportedFileContentType,
} from "@app/types/files";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import type { FileUploadRequestResponseType } from "@dust-tt/client";
import { FileUploadUrlRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import fileIdApp from "./[fileId]";

// Mounted at /api/v1/w/:wId/files.
const app = publicApiApp();

app.route("/:fileId", fileIdApp);

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
app.post(
  "/",
  validate("json", FileUploadUrlRequestSchema),
  async (ctx): HandlerResult<FileUploadRequestResponseType> => {
    const auth = ctx.get("auth");
    const user = auth.user();
    const owner = auth.getNonNullableWorkspace();

    // Only useCase "conversation" is supported for public API.
    const { contentType, fileName, fileSize, useCase, useCaseMetadata } =
      ctx.req.valid("json");

    if (!auth.isSystemKey()) {
      // Agressively rate limit file uploads when not a system key.
      const remaining = await rateLimiter({
        key: `workspace:${owner.id}:file_uploads`,
        maxPerTimeframe: 40,
        timeframeSeconds: 60,
        logger,
      });
      if (remaining < 0) {
        return apiError(ctx, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message: "You have reached the rate limit for this workspace.",
          },
        });
      }

      // Limit use-case if not a system key.
      if (!isPubliclySupportedUseCase(useCase)) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The file use case is not supported by the API.",
          },
        });
      }
    }

    if (!isSupportedFileContentType(contentType)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "file_type_not_supported",
          message: `Content type "${contentType}" is not supported.`,
        },
      });
    }

    if (!isUploadSupportedForContentType({ contentType, useCase })) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "file_type_not_supported",
          message: `Content type "${contentType}" is not supported for use-case ${useCase}.`,
        },
      });
    }

    const flags = await getFeatureFlags(auth);
    const hasSandboxTools = isComputerFeatureEnabled(flags, "sandbox_tools");

    if (
      !ensureFileSize(contentType, fileSize, {
        hasSandboxTools,
        useCase,
      })
    ) {
      return apiError(ctx, {
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
      useCaseMetadata: buildEffectiveUseCaseMetadata({
        contentType,
        fileName,
        flags: { hasSandboxTools },
        providedMetadata: useCaseMetadata,
        useCase,
      }),
    });

    return ctx.json({ file: file.toPublicJSONWithUploadUrl(auth) });
  }
);

export default app;
