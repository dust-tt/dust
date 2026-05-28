import { isUploadSupportedForContentType } from "@app/lib/api/files/processing";
import { buildEffectiveUseCaseMetadata } from "@app/lib/api/files/upload_metadata";
import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { ensureFileSize, isSupportedFileContentType } from "@app/types/files";
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
]);

// Mounted at /api/w/:wId/files.
const app = workspaceApp();

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
  const hasSandboxTools = flags.includes("sandbox_tools");

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
