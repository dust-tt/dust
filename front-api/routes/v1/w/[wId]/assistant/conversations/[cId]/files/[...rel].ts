import {
  getConversationFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import path from "path";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string().min(1),
  rel: z.string().min(1),
});

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/files.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/assistant/conversations/{cId}/files/{rel}:
 *   get:
 *     tags:
 *       - Conversations
 *     summary: Download a conversation-scoped file by path
 *     description: |
 *       Download a file from a conversation's file system by its scoped path. The path must
 *       be conversation-scoped, i.e. start with `conversation/` (as surfaced by agent file
 *       system tools). The file content is streamed directly from the conversation mount.
 *     parameters:
 *       - name: wId
 *         in: path
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - name: cId
 *         in: path
 *         required: true
 *         description: ID of the conversation
 *         schema:
 *           type: string
 *       - name: rel
 *         in: path
 *         required: true
 *         description: |
 *           Conversation-scoped file path, e.g. `conversation/foo.pdf` or
 *           `conversation/subdir/foo.pdf`. The `conversation/` prefix is required; any other
 *           scope prefix is rejected. Path traversal segments (`..`) are rejected.
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: File content streamed directly.
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing or invalid path parameters (e.g. missing or wrong scope prefix).
 *       403:
 *         description: Resolved path is outside the conversation scope.
 *       404:
 *         description: Conversation or file not found.
 *       405:
 *         description: Method not supported.
 */
app.get("/:rel{.+}", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId, rel } = ctx.req.valid("param");

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

  // Require a conversation-scoped path (e.g. `conversation/foo.pdf`), matching what the agent
  // file system tools surface. Bare relative paths and other scope prefixes are rejected.
  const scoped = parseScopedFilePath(rel);
  if (!scoped || scoped.prefix !== "conversation") {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid file path: must be a conversation-scoped path (e.g. `conversation/foo.pdf`).",
      },
    });
  }

  const normalizedRelative = path.posix.normalize(scoped.rel);
  if (
    normalizedRelative.startsWith("..") ||
    normalizedRelative.startsWith("/")
  ) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside conversation scope.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const basePath = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: cId,
  });
  const mountFilePath = `${basePath}${normalizedRelative}`;

  const bucket = getPrivateUploadBucket();
  const contentTypeResult = await bucket.getFileContentType(mountFilePath);
  if (contentTypeResult.isErr()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }
  const contentType = contentTypeResult.value ?? "application/octet-stream";
  const readStream = bucket.file(mountFilePath).createReadStream();

  const webStream = new ReadableStream({
    start(controller) {
      readStream.on("data", (chunk) => controller.enqueue(chunk));
      readStream.on("end", () => controller.close());
      readStream.on("error", (err) => {
        logger.error(
          { err, mountFilePath },
          "Error streaming conversation file (GCS)"
        );
        controller.error(err);
      });
    },
    cancel() {
      readStream.destroy();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: { "Content-Type": contentType },
  });
});

export default app;
