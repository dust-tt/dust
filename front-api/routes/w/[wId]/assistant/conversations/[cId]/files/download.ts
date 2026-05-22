import {
  getConversationFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { Hono } from "hono";
import path from "path";
import { z } from "zod";

const PostDownloadBodySchema = z.object({
  filePath: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/files/download.
const app = new Hono();

app.post("/", validate("json", PostDownloadBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const cId = ctx.req.param("cId") ?? "";

  const { filePath } = ctx.req.valid("json");

  const scopedPath = parseScopedFilePath(filePath);
  if (!scopedPath || scopedPath.prefix !== "conversation") {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid filePath: must be a scoped path (e.g. conversation/file.png).",
      },
    });
  }

  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const expectedPrefix = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: cId,
  });
  const normalizedPath = path.posix.normalize(expectedPrefix + scopedPath.rel);
  if (!normalizedPath.startsWith(expectedPrefix)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside conversation scope.",
      },
    });
  }

  const bucket = getPrivateUploadBucket();

  const contentTypeResult = await bucket.getFileContentType(normalizedPath);
  if (contentTypeResult.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const headers: Record<string, string> = {};
  if (contentTypeResult.isOk() && contentTypeResult.value) {
    headers["Content-Type"] = contentTypeResult.value;
  }

  const fileName = path.posix.basename(normalizedPath);
  headers["Content-Disposition"] =
    `attachment; filename="${encodeURIComponent(fileName)}"`;

  const readStream = bucket.file(normalizedPath).createReadStream();

  const webStream = new ReadableStream({
    start(controller) {
      readStream.on("data", (chunk) => controller.enqueue(chunk));
      readStream.on("end", () => controller.close());
      readStream.on("error", (err) => {
        logger.error(
          { err, filePath: normalizedPath },
          "Error streaming conversation file"
        );
        controller.error(err);
      });
    },
    cancel() {
      readStream.destroy();
    },
  });

  return new Response(webStream, { status: 200, headers });
});

export default app;
