import {
  getConversationFilesBasePath,
  parseCanonicalScopedPath,
  parseScopedFilePath,
} from "@app/types/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { readableToReadableStream } from "@app/types/shared/utils/streams";
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
 *       Download a file from a conversation's file system by its scoped path. Pass the
 *       canonical `filePath` surfaced in a message action's `generatedFiles` (the legacy
 *       `conversation/foo.pdf` form is also accepted). The file content is streamed
 *       directly from the conversation mount.
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
 *           Conversation-scoped file path: the canonical `filePath` returned in a message
 *           action's `generatedFiles`, or the legacy `conversation/foo.pdf` form. Paths
 *           scoped to another conversation or to a different scope are rejected. Path
 *           traversal segments (`..`) are rejected.
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

  // Require a conversation-scoped path. The legacy `conversation/foo.pdf` form is still
  // accepted, alongside the canonical scoped path that current file tools surface in
  // generatedFiles.
  const legacyScoped = parseScopedFilePath(rel);
  const canonicalScoped = legacyScoped ? null : parseCanonicalScopedPath(rel);

  let relativePath: string | null = null;
  if (legacyScoped?.prefix === "conversation") {
    relativePath = legacyScoped.rel;
  } else if (
    canonicalScoped?.scope.kind === "canonical-conversation" &&
    canonicalScoped.scope.id === cId
  ) {
    relativePath = canonicalScoped.relPath;
  } else if (
    canonicalScoped?.scope.kind === "canonical-conversation" &&
    canonicalScoped.scope.id !== cId
  ) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside conversation scope.",
      },
    });
  }

  if (relativePath === null) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid file path: must be a conversation-scoped path (the `filePath` from a message action's `generatedFiles`, or a `conversation/...` path).",
      },
    });
  }

  const normalizedRelative = path.posix.normalize(relativePath);
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
  readStream.on("error", (err) =>
    logger.error(
      { err, mountFilePath },
      "Error streaming conversation file (GCS)"
    )
  );
  return new Response(readableToReadableStream(readStream), {
    status: 200,
    headers: { "Content-Type": contentType },
  });
});

export default app;
