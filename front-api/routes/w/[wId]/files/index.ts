import { isUploadSupportedForContentType } from "@app/lib/api/files/processing";
import { buildEffectiveUseCaseMetadata } from "@app/lib/api/files/upload_metadata";
import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { ensureFileSize, isSupportedFileContentType } from "@app/types/files";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import file from "./[fileId]";
import canonicalPath from "./path/[...canonicalPath]";

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
    }),
  }),
  z.object({
    contentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    useCase: z.literal("skill_attachment"),
    useCaseMetadata: z.object({ skillId: z.string() }).optional(),
  }),
  z.object({
    contentType: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    useCase: z.literal("workspace_branding"),
    useCaseMetadata: z.object({
      asset: z.enum(["logo", "favicon"]),
    }),
  }),
]);

// Mounted at /api/w/:wId/files.
const app = workspaceApp();

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
 *                 enum: [conversation, folders_document, avatar, upsert_document, upsert_table, project_context, skill_attachment, workspace_branding]
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

app.post("/", validate("json", FileUploadUrlRequestSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

  // Aggressively rate limit file uploads.
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

  const { contentType, fileName, fileSize, useCase, useCaseMetadata } =
    ctx.req.valid("json");

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

  const newFile = await FileResource.makeNew({
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

  return ctx.json({ file: newFile.toJSONWithUploadUrl(auth) });
});

app.route("/path", canonicalPath);
app.route("/:fileId", file);

export default app;
