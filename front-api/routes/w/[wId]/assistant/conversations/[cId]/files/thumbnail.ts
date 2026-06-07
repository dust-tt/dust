import {
  getConversationFilesBasePath,
  parseScopedFilePath,
} from "@app/lib/api/files/mount_path";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { isSupportedImageContentType } from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import { readableToReadableStream } from "@app/types/shared/utils/streams";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import path from "path";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/files/thumbnail.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId } = ctx.req.valid("param");
  const filePath = ctx.req.query("filePath");

  if (!isString(filePath)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters, `cId` and `filePath` (strings) are required.",
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

  const owner = auth.getNonNullableWorkspace();
  const basePath = getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: cId,
  });
  const normalizedPath = path.posix.normalize(`${basePath}${scopedPath.rel}`);
  if (!normalizedPath.startsWith(basePath)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside conversation scope.",
      },
    });
  }

  const [fileResource] = await FileResource.fetchByMountFilePaths(auth, [
    normalizedPath,
  ]);

  // If a FileResource exists, stream its best available version (processed if available).
  if (fileResource) {
    if (!isSupportedImageContentType(fileResource.contentType)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Thumbnail is only supported for image files.",
        },
      });
    }

    const readStream = fileResource.getContentReadStream(auth);
    const webStream = readableToReadableStream(readStream);

    return new Response(webStream, {
      status: 200,
      headers: {
        "Content-Type": fileResource.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // No FileResource, stream directly from GCS (sandbox-generated file).
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

  const contentType = contentTypeResult.value ?? "application/octet-stream";
  if (!isSupportedImageContentType(contentType)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Thumbnail is only supported for image files.",
      },
    });
  }

  const readStream = bucket.file(normalizedPath).createReadStream();

  const webStream = new ReadableStream({
    start(controller) {
      readStream.on("data", (chunk) => controller.enqueue(chunk));
      readStream.on("end", () => controller.close());
      readStream.on("error", (err) => {
        logger.error(
          { err, filePath: normalizedPath },
          "Error streaming thumbnail (GCS)"
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
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
});

export default app;
