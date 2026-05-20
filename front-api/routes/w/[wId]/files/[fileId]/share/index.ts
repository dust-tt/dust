import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import {
  fileShareScopeSchema,
  isConversationFileUseCase,
  isInteractiveContentType,
} from "@app/types/files";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import grants from "./grants";

const ShareFileRequestBodySchema = z.object({
  shareScope: fileShareScopeSchema,
});

// Mounted at /api/w/:wId/files/:fileId/share.
const app = new Hono();

// Register `/grants` BEFORE the bare `/` handlers — see [API2] for ordering
// rules around literal vs. param siblings (though they are different routes,
// keeping mounts before leaf handlers matches the convention used elsewhere).
app.route("/grants", grants);

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

  const file = await fetchShareableFile(ctx, auth, fileId);
  if (file instanceof Response) {
    return file;
  }

  const shareInfo = await file.getShareInfo();
  if (!shareInfo) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  return ctx.json(shareInfo);
});

app.post("/", validate("json", ShareFileRequestBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const fileId = ctx.req.param("fileId") ?? "";

  const file = await fetchShareableFile(ctx, auth, fileId);
  if (file instanceof Response) {
    return file;
  }

  const { shareScope } = ctx.req.valid("json");

  await file.setShareScope(auth, shareScope);

  const shareInfo = await file.getShareInfo();
  if (!shareInfo) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  return ctx.json(shareInfo);
});

// Returns the file when it exists, is interactive, and (if linked to a
// conversation) the caller can access it. Otherwise returns a `Response` for
// the handler to short-circuit on.
async function fetchShareableFile(
  ctx: Context,
  auth: Authenticator,
  fileId: string
): Promise<FileResource | Response> {
  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  if (
    isConversationFileUseCase(file.useCase) &&
    file.useCaseMetadata?.conversationId
  ) {
    const conversation = await ConversationResource.fetchById(
      auth,
      file.useCaseMetadata.conversationId
    );
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "File not found." },
      });
    }
  }

  if (
    !file.isInteractiveContent ||
    !isInteractiveContentType(file.contentType)
  ) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files can be shared publicly.",
      },
    });
  }

  return file;
}

export default app;
