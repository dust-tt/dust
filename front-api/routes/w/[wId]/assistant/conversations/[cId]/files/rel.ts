import { moveMountFileWithinScope } from "@app/lib/api/files/mount_file_ops";
import {
  getConversationFilesBasePath,
  isResolveMountFilePathError,
  resolveScopedMountFilePath,
} from "@app/lib/api/files/mount_path";
import { MoveMountFileRequestBodySchema } from "@app/lib/api/files/mount_schemas";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

export type ConversationFileRelResponseBody = Record<string, never>;

// Catch-all for /api/w/:wId/assistant/conversations/:cId/files/<...rel>.
// Mounted from files/index.ts at the root path.
const app = new Hono();

app.get("/:rel{.+}", async (ctx) => {
  const auth = ctx.get("auth");
  const cId = ctx.req.param("cId") ?? "";
  const rel = ctx.req.param("rel");

  if (!isString(rel) || rel.length === 0) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing file path.",
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
  const mountBasePath = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: cId,
  });

  const pathRes = resolveScopedMountFilePath({
    relPath: rel,
    expectedPrefix: "conversation",
    mountBasePath,
    outsideScopeMessage: "Access denied: path is outside conversation scope.",
  });
  if (pathRes.isErr()) {
    const { code, message } = pathRes.error;
    return apiError(ctx, {
      status_code: code === "outside_scope" ? 403 : 400,
      api_error: {
        type:
          code === "outside_scope"
            ? "workspace_auth_error"
            : "invalid_request_error",
        message,
      },
    });
  }
  const { normalizedGcsPath } = pathRes.value;

  const bucket = getPrivateUploadBucket();
  const contentTypeResult = await bucket.getFileContentType(normalizedGcsPath);
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
  const readStream = bucket.file(normalizedGcsPath).createReadStream();

  const webStream = new ReadableStream({
    start(controller) {
      readStream.on("data", (chunk) => controller.enqueue(chunk));
      readStream.on("end", () => controller.close());
      readStream.on("error", (err) => {
        logger.error(
          { err, gcsPath: normalizedGcsPath },
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

app.post(
  "/:rel{.+}",
  validate("json", MoveMountFileRequestBodySchema),
  async (ctx): HandlerResult<ConversationFileRelResponseBody> => {
    const auth = ctx.get("auth");
    const cId = ctx.req.param("cId") ?? "";
    const rel = ctx.req.param("rel");

    if (!isString(rel) || rel.length === 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Missing file path.",
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

    const { destRelativeFilePath } = ctx.req.valid("json");

    const moveResult = await moveMountFileWithinScope(
      auth,
      { useCase: "conversation", conversationId: cId },
      {
        sourcePath: rel,
        destRelativeFilePath,
      }
    );
    if (moveResult.isErr()) {
      if (isResolveMountFilePathError(moveResult.error)) {
        const { code, message } = moveResult.error;
        return apiError(ctx, {
          status_code: code === "outside_scope" ? 403 : 400,
          api_error: {
            type:
              code === "outside_scope"
                ? "workspace_auth_error"
                : "invalid_request_error",
            message,
          },
        });
      }
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: normalizeError(moveResult.error).message,
        },
      });
    }

    return ctx.json({});
  }
);

export default app;
