import { validateFileUpload } from "@app/lib/api/files/upload";
import { buildEffectiveUseCaseMetadata } from "@app/lib/api/files/upload_metadata";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import file from "./[fileId]";
import collabTickets from "./collab-tickets";
import commentSignatures from "./comment-signatures";
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
  if (remaining <= 0) {
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

  if (useCase === "project_context") {
    const space = await SpaceResource.fetchById(auth, useCaseMetadata.spaceId);
    if (!space) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The Pod was not found.",
        },
      });
    }
    if (!auth.can("write", space)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You cannot edit files in that pod.",
        },
      });
    }
  }

  const validation = await validateFileUpload(auth, {
    contentType,
    fileName,
    fileSize,
    useCase,
  });
  if (validation.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: validation.error.code,
        message: validation.error.message,
      },
    });
  }
  const { contentType: supportedContentType, hasSandboxTools } =
    validation.value;

  const newFile = await FileResource.makeNew({
    contentType: supportedContentType,
    fileName,
    fileSize,
    userId: user.id,
    workspaceId: owner.id,
    useCase,
    useCaseMetadata: buildEffectiveUseCaseMetadata({
      contentType: supportedContentType,
      fileName,
      flags: { hasSandboxTools },
      providedMetadata: useCaseMetadata,
      useCase,
    }),
  });

  return ctx.json({ file: newFile.toJSONWithUploadUrl(auth) });
});

app.route("/collab-tickets", collabTickets);
app.route("/comment-signatures", commentSignatures);
app.route("/path", canonicalPath);
app.route("/:fileId", file);

export default app;
