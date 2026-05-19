/**
 * @swagger
 * /api/w/{wId}/files:
 *   post:
 *     summary: Create a file upload
 *     description: Creates a file record and returns a pre-signed upload URL. The file content should then be uploaded to the returned URL.
 *     tags:
 *       - Private Files
 *     parameters:
 *       - in: path
 *         name: wId
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
 *             properties:
 *               contentType:
 *                 type: string
 *               fileName:
 *                 type: string
 *               fileSize:
 *                 type: number
 *               useCase:
 *                 type: string
 *                 enum: [conversation, folders_document, avatar, upsert_document, upsert_table, project_context, skill_attachment]
 *               useCaseMetadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: File record created with upload URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file:
 *                   $ref: '#/components/schemas/PrivateFileWithUploadUrl'
 *       400:
 *         description: Invalid request
 *       429:
 *         description: Rate limit exceeded
 */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { isUploadSupportedForContentType } from "@app/lib/api/files/processing";
import { buildEffectiveUseCaseMetadata } from "@app/lib/api/files/upload_metadata";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { FileTypeWithUploadUrl } from "@app/types/files";
import { ensureFileSize, isSupportedFileContentType } from "@app/types/files";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// File upload form validation.

const FileUploadUrlRequestSchema = z.discriminatedUnion("useCase", [
  z.object({
    contentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    useCase: z.literal("conversation"),
    useCaseMetadata: z
      .object({
        conversationId: z.string(),
      })
      .optional(),
  }),
  z.object({
    contentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    useCase: z.literal("folders_document"),
    useCaseMetadata: z.object({
      spaceId: z.string(),
    }),
  }),
  z.object({
    contentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    useCase: z.literal("avatar"),
    useCaseMetadata: z.undefined(),
  }),
  z.object({
    contentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    useCase: z.literal("upsert_document"),
    useCaseMetadata: z.undefined(),
  }),
  z.object({
    contentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    useCase: z.literal("upsert_table"),
    useCaseMetadata: z
      .object({
        spaceId: z.string(),
      })
      .optional(),
  }),
  z.object({
    contentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    useCase: z.literal("project_context"),
    useCaseMetadata: z.object({
      spaceId: z.string(),
      mountRelativeDir: z.string().optional(),
    }),
  }),
  z.object({
    contentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    useCase: z.literal("skill_attachment"),
    useCaseMetadata: z.object({ skillId: z.string() }).optional(),
  }),
]);

export interface FileUploadRequestResponseBody {
  file: FileTypeWithUploadUrl;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileUploadRequestResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "POST": {
      const bodyValidation = FileUploadUrlRequestSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }

      // Aggressively rate limit file uploads.
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
        bodyValidation.data;

      if (!isSupportedFileContentType(contentType)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_type_not_supported",
            message: `Content type "${contentType}" is not supported.`,
          },
        });
      }

      if (!isUploadSupportedForContentType({ contentType, useCase })) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "file_type_not_supported",
            message: `Content type "${contentType}" is not supported for use-case ${useCase}.`,
          },
        });
      }

      const flags = await getFeatureFlags(auth);
      const hasSandboxTools = flags.includes("sandbox_tools");

      if (
        !ensureFileSize(contentType, fileSize, {
          hasSandboxTools,
          useCase,
        })
      ) {
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
        useCaseMetadata: buildEffectiveUseCaseMetadata({
          contentType,
          fileName,
          flags: { hasSandboxTools },
          providedMetadata: useCaseMetadata,
          useCase,
        }),
      });

      res.status(200).json({ file: file.toJSONWithUploadUrl(auth) });
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

export default withSessionAuthenticationForWorkspace(handler);
